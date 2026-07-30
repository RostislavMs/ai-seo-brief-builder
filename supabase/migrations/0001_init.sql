-- AI SEO Brief Builder — початкова схема.
--
-- Виконати один раз у Supabase → SQL Editor (або `supabase db push`).
-- Скрипт ідемпотентний: повторний запуск нічого не ламає.
--
-- Модель доступу подвійна. Сервер (Nitro) ходить у базу сервісним ключем і
-- сам звіряє user_id із перевіреного JWT — це основний шлях. RLS нижче —
-- другий рубіж: якщо колись фронт піде в базу напряму (або витече
-- publishable-ключ), користувач усе одно побачить лише свої рядки.

-- ─── Профілі ───────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Публічна частина акаунта. auth.users читати з клієнта не можна, тому ім''я та пошта дублюються сюди.';

-- ─── Сесії (розділ 5 ТЗ) ───────────────────────────────────────────────────

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  topic text not null default '',
  urls text[] not null default '{}',
  -- Бриф лежить одним JSON: він завжди читається й пишеться цілком,
  -- а розкладати його на таблиці означало б дублювати zod-схему в SQL.
  brief jsonb,
  -- Списку сесій потрібен лише факт наявності ТЗ. Обчислювана колонка
  -- дозволяє не тягнути десятки кілобайт JSON на кожен рядок списку.
  has_brief boolean generated always as (brief is not null) stored,
  legacy_brief_removed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Головний запит застосунку — «мої сесії, найсвіжіші зверху».
create index if not exists sessions_user_updated_idx
  on public.sessions (user_id, updated_at desc);

-- Спарсені сторінки — окрема таблиця, а не масив у sessions: одна сторінка
-- важить сотні кілобайт, і оновлення однієї не має переписувати решту.
create table if not exists public.session_analyses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  -- Порядок URL задає користувач; сортувати за created_at не можна,
  -- бо аналіз усіх сторінок стартує паралельно.
  position integer not null,
  url text not null,
  status text not null default 'pending'
    check (status in ('pending', 'loading', 'success', 'error')),
  page jsonb,
  error text,
  analyzed_at timestamptz
);

create index if not exists session_analyses_session_idx
  on public.session_analyses (session_id, position);

create table if not exists public.session_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  changed_brief boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists session_messages_session_idx
  on public.session_messages (session_id, created_at);

-- ─── Ключі AI-провайдерів ──────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ai_provider') then
    create type public.ai_provider as enum ('gemini', 'openai', 'anthropic');
  end if;
end
$$;

-- Ключ шифрується на сервері (AES-256-GCM) і в такому вигляді лежить тут.
-- Навіть із дампом бази ключ не відновити без BRIEF_ENCRYPTION_KEY.
create table if not exists public.user_ai_keys (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider public.ai_provider not null,
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  -- Останні символи ключа — щоб користувач упізнав свій ключ у списку.
  hint text not null,
  model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

comment on table public.user_ai_keys is
  'RLS увімкнено без жодної політики: рядки доступні лише сервісному ключу. Клієнт отримує ключі виключно через /api/keys, і завжди без секрету.';

-- ─── Налаштування користувача ──────────────────────────────────────────────

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- null — ключа ще не додано, генерація ТЗ недоступна.
  active_provider public.ai_provider,
  -- brief_language прибрано в 0002: мова ТЗ визначається зі сторінок конкурентів.
  brief_language text,
  updated_at timestamptz not null default now()
);

-- ─── updated_at ────────────────────────────────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  target record;
begin
  for target in
    select unnest(array[
      'profiles', 'sessions', 'user_ai_keys', 'user_settings'
    ]) as table_name
  loop
    execute format(
      'drop trigger if exists touch_%1$s_updated_at on public.%1$s',
      target.table_name
    );
    execute format(
      'create trigger touch_%1$s_updated_at before update on public.%1$s
         for each row execute function public.touch_updated_at()',
      target.table_name
    );
  end loop;
end
$$;

-- ─── Профіль створюється разом з акаунтом ──────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── RLS ───────────────────────────────────────────────────────────────────

alter table public.profiles          enable row level security;
alter table public.sessions          enable row level security;
alter table public.session_analyses  enable row level security;
alter table public.session_messages  enable row level security;
alter table public.user_ai_keys      enable row level security;
alter table public.user_settings     enable row level security;

drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists sessions_self on public.sessions;
create policy sessions_self on public.sessions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Дочірні таблиці не мають user_id: власник визначається через сесію.
-- Дублювати user_id тут означало б тримати два джерела правди.
drop policy if exists session_analyses_self on public.session_analyses;
create policy session_analyses_self on public.session_analyses
  for all to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );

drop policy if exists session_messages_self on public.session_messages;
create policy session_messages_self on public.session_messages
  for all to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );

drop policy if exists user_settings_self on public.user_settings;
create policy user_settings_self on public.user_settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- user_ai_keys навмисно лишається без політик: жодна роль, крім сервісної,
-- не має бачити навіть зашифрований ключ.

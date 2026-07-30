-- Роль користувача та правила для мов.
--
-- Виконати у Supabase → SQL Editor після 0001 і 0002.
-- Скрипт ідемпотентний: повторний запуск нічого не ламає.
--
-- Правило для мови — додаткова вимога до ТЗ, яка діє лише тоді, коли мова
-- проаналізованих сторінок збігається з мовою правила. Пропозицію може
-- подати будь-хто, а вводить її в дію адмін: текст правила дописується
-- у промпт до моделі, і пускати туди неперевірений рядок не можна.

-- ─── Роль ──────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('user', 'admin');
  end if;
end
$$;

alter table public.profiles
  add column if not exists role public.user_role not null default 'user';

comment on column public.profiles.role is
  'Роль керує лише правилами для мов: admin розглядає пропозиції, user їх подає. Перший адмін призначається через NITRO_ADMIN_EMAILS або вручну: update public.profiles set role = ''admin'' where email = ''…'';';

-- Політика profiles_self із 0001 дозволяє власнику будь-яку дію зі своїм
-- рядком — а тепер у цьому рядку є роль. RLS не вміє обмежувати окремі
-- колонки, тому без наступних двох рядків будь-хто підняв би собі права
-- одним UPDATE через publishable-ключ.
--
-- Писати в profiles з браузера застосунок не вміє й не має: усі зміни йдуть
-- через /api сервісним ключем, а на роль service_role ці revoke не діють.
revoke insert, update, delete on public.profiles from authenticated;
revoke insert, update, delete on public.profiles from anon;

-- ─── Правила для мов ───────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_type where typname = 'language_rule_status') then
    create type public.language_rule_status as enum (
      'pending', 'approved', 'rejected'
    );
  end if;
end
$$;

create table if not exists public.language_rules (
  id uuid primary key default gen_random_uuid(),

  -- Код ISO 639-1 або '*' — правило для всіх мов. Сам перелік мов лежить
  -- у коді (packages/shared/src/languages/registry.ts), а не тут: він
  -- статичний, потрібен обом застосункам, і таблиця-довідник дала б лише
  -- зайвий join. Обмеження на формат — окремим ALTER нижче.
  language_code text not null,

  -- Межа в 500 символів не косметична: текст іде в промпт, і правило
  -- на пів сторінки витіснило б звідти самі дані конкурентів.
  rule text not null check (char_length(btrim(rule)) between 3 and 500),

  status public.language_rule_status not null default 'pending',

  -- enabled окремо від status навмисно: «вимкнути на час» і «відхилити
  -- назавжди» — різні дії. Одним полем різниця між ними зникає.
  enabled boolean not null default true,

  -- Посилання на profiles, а не на auth.users: пошта автора читається саме
  -- звідти, і зв'язок має вести туди, куди ходить запит. Той самий власник,
  -- бо profiles.id сам посилається на auth.users з каскадом.
  --
  -- on delete set null, а не cascade: правило переживає акаунт автора.
  -- Схвалене правило належить проєкту, і видалення людини не має
  -- змінювати те, за якими вимогами генерується ТЗ.
  created_by uuid references public.profiles (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,

  -- Причина рішення. Без неї відхилення нічого не каже автору,
  -- і він подає те саме правило вдруге.
  review_note text check (review_note is null or char_length(review_note) <= 500),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.language_rules is
  'Додаткові вимоги до ТЗ. language_code = код ISO 639-1 або ''*'' (для всіх мов). У промпт ідуть лише рядки зі status = approved і enabled = true.';

-- Формат коду мови — окремим ALTER, а не всередині CREATE TABLE:
-- create table if not exists не змінює обмежень наявної таблиці, тому
-- накатування наново не виправило б його. Саме через це '*' і додається тут.
alter table public.language_rules
  drop constraint if exists language_rules_language_code_check;

alter table public.language_rules
  add constraint language_rules_language_code_check
  check (language_code = '*' or language_code ~ '^[a-z]{2}$');

-- Головний запит генерації ТЗ — «чинні правила цієї мови».
create index if not exists language_rules_active_idx
  on public.language_rules (language_code)
  where status = 'approved' and enabled;

-- Черга адміна — «усі пропозиції, найстаріші зверху».
create index if not exists language_rules_pending_idx
  on public.language_rules (created_at)
  where status = 'pending';

-- Свої пропозиції користувач бачить незалежно від статусу.
create index if not exists language_rules_author_idx
  on public.language_rules (created_by);

create index if not exists language_rules_language_idx
  on public.language_rules (language_code, status);

drop trigger if exists touch_language_rules_updated_at on public.language_rules;
create trigger touch_language_rules_updated_at
  before update on public.language_rules
  for each row execute function public.touch_updated_at();

-- ─── RLS ───────────────────────────────────────────────────────────────────
--
-- Як і решта схеми, це другий рубіж: сервер ходить у базу сервісним ключем
-- і сам звіряє роль із перевіреного JWT. Політики нижче страхують випадок,
-- коли до бази піде фронт напряму.

-- security definer, бо profiles закрита політикою «лише свій рядок»:
-- без цього перевірка ролі не побачила б навіть власний профіль у підзапиті.
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'admin'
  );
$$;

alter table public.language_rules enable row level security;

-- Читання: чинні правила бачать усі, свої пропозиції — автор, решту — адмін.
drop policy if exists language_rules_read on public.language_rules;
create policy language_rules_read on public.language_rules
  for select to authenticated
  using (
    (status = 'approved' and enabled)
    or created_by = (select auth.uid())
    or public.is_admin()
  );

-- Створення: лише від свого імені й лише як пропозиція. Одразу чинне правило
-- створює тільки адмін — інакше перевірка перед промптом нічого не варта.
drop policy if exists language_rules_insert on public.language_rules;
create policy language_rules_insert on public.language_rules
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (status = 'pending' or public.is_admin())
  );

-- Правка й видалення — виключно адмін.
drop policy if exists language_rules_admin_update on public.language_rules;
create policy language_rules_admin_update on public.language_rules
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists language_rules_admin_delete on public.language_rules;
create policy language_rules_admin_delete on public.language_rules
  for delete to authenticated
  using (public.is_admin());

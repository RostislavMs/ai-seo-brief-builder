-- Промпти, які можна правити на сайті.
--
-- Виконати у Supabase → SQL Editor після 0005.
-- Скрипт ідемпотентний: повторний запуск нічого не ламає.
--
-- Початковий текст кожного промпта лежить у коді
-- (apps/server/src/services/prompts/defaults.ts), а не тут. Тому:
--
-- - рядка в prompt_templates немає  → діє текст із коду;
-- - рядок є                        → діє його body, тобто правка адміна.
--
-- Через це «скинути до початкового» — це delete рядка, а не пошук першої
-- версії в історії: початковий текст завжди рівно один, і він у коді разом
-- зі списком змінних, які промпт зобовʼязаний містити.

-- ─── Чинний текст ──────────────────────────────────────────────────────────

create table if not exists public.prompt_templates (
  -- Ключ із реєстру в коді ('brief.system', 'compare.user'). Тут лише
  -- перевірка форми: чи існує такий промпт, знає код, і саме він відповідає
  -- 404 на невідомий ключ. Таблиця-довідник дала б синхронізацію двох
  -- переліків замість одного.
  key text primary key
    check (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),

  -- Межа в 20 000 символів — не косметична. Промпт цілком іде в кожен запит
  -- до моделі, тому текст на дві сторінки коштує токенів на кожній генерації.
  body text not null check (char_length(btrim(body)) between 10 and 20000),

  -- Хто змінював останнім. on delete set null, як і в правилах: промпт
  -- належить проєкту й переживає акаунт того, хто його правив.
  updated_by uuid references public.profiles (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.prompt_templates is
  'Правки промптів. Рядок = перевизначення тексту з коду; немає рядка = діє початковий текст із apps/server/src/services/prompts/defaults.ts.';

drop trigger if exists touch_prompt_templates_updated_at on public.prompt_templates;
create trigger touch_prompt_templates_updated_at
  before update on public.prompt_templates
  for each row execute function public.touch_updated_at();

-- ─── Історія змін ──────────────────────────────────────────────────────────
--
-- Окрема таблиця, а не версійність усередині prompt_templates: чинний текст
-- читається на кожну генерацію ТЗ, і тягнути через цей запит усі попередні
-- редакції промпта означало б платити за історію в найгарячішому місці.

create table if not exists public.prompt_template_history (
  id uuid primary key default gen_random_uuid(),

  -- Без foreign key на prompt_templates навмисно: скидання видаляє рядок
  -- чинного тексту, а історія має пережити скидання — інакше вона зникала б
  -- разом із тим, що якраз і треба показати.
  key text not null,

  -- null — скинуто до початкового тексту. Саме текст, а не diff: промпт
  -- читають, порівнюючи з наступною редакцією очима, і повний знімок
  -- дозволяє повернути будь-яку з них одним запитом.
  body text check (body is null or char_length(btrim(body)) between 10 and 20000),

  -- Навіщо змінювали. Без цього історія показує «що», але не «чому»,
  -- і за пів року причина правки не відновлюється.
  note text check (note is null or char_length(note) <= 500),

  changed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.prompt_template_history is
  'Історія правок промптів, лише додавання. body = null означає скидання до початкового тексту з коду.';

-- Головний запит сторінки: «історія одного промпта, найновіше зверху».
create index if not exists prompt_template_history_key_idx
  on public.prompt_template_history (key, created_at desc);

-- ─── RLS ───────────────────────────────────────────────────────────────────
--
-- Як і решта схеми, це другий рубіж: сервер ходить у базу сервісним ключем
-- і сам звіряє роль із перевіреного JWT. Політики нижче страхують випадок,
-- коли до бази піде фронт напряму.

alter table public.prompt_templates enable row level security;
alter table public.prompt_template_history enable row level security;

-- Читання — усім, хто ввійшов: за цими текстами генерується ТЗ, і бачити,
-- що саме просять у моделі, має кожен, а не лише адмін.
drop policy if exists prompt_templates_read on public.prompt_templates;
create policy prompt_templates_read on public.prompt_templates
  for select to authenticated
  using (true);

drop policy if exists prompt_template_history_read on public.prompt_template_history;
create policy prompt_template_history_read on public.prompt_template_history
  for select to authenticated
  using (true);

-- Запис — виключно адмін: текст промпта це і є завдання для моделі,
-- і неперевірена правка тут коштує дорожче за неперевірене правило.
drop policy if exists prompt_templates_admin_write on public.prompt_templates;
create policy prompt_templates_admin_write on public.prompt_templates
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Історія лише дописується: рядок, який можна прибрати, історією не є.
drop policy if exists prompt_template_history_admin_insert on public.prompt_template_history;
create policy prompt_template_history_admin_insert on public.prompt_template_history
  for insert to authenticated
  with check (public.is_admin() and changed_by = (select auth.uid()));

-- Публічна версія сесії — те, що видно за посиланням без входу.
--
-- Виконати у Supabase → SQL Editor після 0001–0007.
-- Скрипт ідемпотентний: повторний запуск нічого не ламає.
--
-- Публікується не сесія, а її зліпок. Причина в тому, що сесія — робоче місце:
-- у ній перезапускають аналіз, перегенеровують ТЗ і правлять його через чат.
-- Якби посилання читало сесію напряму, кожна така дія моментально змінювала б
-- те, що бачить клієнт, — включно з проміжними станами, яких показувати не
-- збиралися. Тому вміст замерзає на момент публікації, а оновлюється окремою
-- кнопкою.

create table if not exists public.session_shares (
  -- Ключ — токен, а не id сесії: посилання йде людям, яких у застосунку немає,
  -- і воно не має розкривати внутрішній ідентифікатор. 16 випадкових байтів
  -- у base64url — 22 символи, перебором не беруться.
  token text primary key,
  -- unique: публічна версія в сесії одна. Друга поряд означала б два посилання
  -- з різним вмістом і жодного способу зрозуміти, яке з них актуальне.
  session_id uuid not null unique
    references public.sessions (id) on delete cascade,
  -- Що саме увійшло в зліпок. Самого snapshot для цього не достатньо: порожній
  -- масив сторінок означає і «не публікували аналіз», і «публікували, але
  -- жодна сторінка не годилася» — а форма для повторної публікації має
  -- показати рівно те, що вибрали минулого разу.
  include_analyses boolean not null default false,
  include_comparison boolean not null default false,
  -- updated_at сесії на момент зліпка. Окремою колонкою, а не полем усередині
  -- snapshot: сторінка сесії питає лише «чи відстало опубліковане», і читати
  -- заради цього jsonb на кілька мегабайтів немає сенсу.
  captured_at timestamptz not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.session_shares is
  'Публічна версія сесії: незмінний зліпок за посиланням /p/<token>. Оновлюється лише окремою дією власника.';

comment on column public.session_shares.snapshot is
  'Замерзлий вміст: назва, тема, ТЗ, сторінки конкурентів, власна сторінка й звіт порівняння — рівно те, що вибрали при публікації. Чату тут немає ніколи.';

comment on column public.session_shares.captured_at is
  'updated_at сесії на момент зліпка. Свіжіший updated_at сесії означає, що опубліковане відстало від робочого.';

comment on column public.session_shares.updated_at is
  'Коли публічну версію створили або оновили — саме ця дата показується як «опубліковано».';

-- Окремих індексів немає навмисно: обидва шляхи читання йдуть по ключах, які
-- вже мають унікальні індекси, — за токеном (публічна сторінка) і за
-- session_id (сесія власника).

-- ─── updated_at ────────────────────────────────────────────────────────────
-- Функція та сама, що й у 0001: публікація не має щоразу передавати дату
-- руками, інакше «оновлено» показувало б час клієнта, а не запису.

drop trigger if exists touch_session_shares_updated_at on public.session_shares;
create trigger touch_session_shares_updated_at
  before update on public.session_shares
  for each row execute function public.touch_updated_at();

-- ─── RLS ───────────────────────────────────────────────────────────────────

alter table public.session_shares enable row level security;

-- Політика лише для власника — як у session_analyses, через сесію: свого
-- user_id тут немає навмисно, інакше власник рядка мав би два джерела правди.
--
-- Політики для anon немає, і це не пропуск: публічна сторінка читає зліпок
-- через /api/public/shares/:token сервісним ключем. Відкривати таблицю
-- анонімній ролі означало б дати перебір по всіх опублікованих сесіях —
-- токен захищає конкретне посилання, а не список посилань.
drop policy if exists session_shares_self on public.session_shares;
create policy session_shares_self on public.session_shares
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

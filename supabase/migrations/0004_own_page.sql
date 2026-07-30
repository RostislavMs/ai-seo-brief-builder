-- Аналіз власної сторінки відносно конкурентів (розділ 15 ТЗ).
--
-- Виконати у Supabase → SQL Editor після 0001–0003.
-- Скрипт ідемпотентний: повторний запуск нічого не ламає.
--
-- Власна сторінка проходить той самий пайплайн, що й конкуренти: той самий
-- каскад доступу, той самий парсер, той самий ParsedPage. Тому вона лежить
-- у session_analyses, а не в окремій таблиці — інакше довелося б дублювати
-- і схему рядка, і весь шлях збереження результату парсингу.
--
-- Відрізняє її одна колонка. Без неї сторінка мовчки пішла б у промпт
-- генерації ТЗ разом із конкурентами, і ТЗ склалося б у тому числі зі
-- сторінки, яку воно має виправити.

alter table public.session_analyses
  add column if not exists role text not null default 'competitor';

-- Обмеження окремим ALTER, а не всередині ADD COLUMN: якщо колонка вже є,
-- add column if not exists не виконується взагалі — разом із перевіркою.
alter table public.session_analyses
  drop constraint if exists session_analyses_role_check;

alter table public.session_analyses
  add constraint session_analyses_role_check
  check (role in ('competitor', 'own'));

comment on column public.session_analyses.role is
  'competitor — сторінка конкурента, йде в промпт генерації ТЗ; own — власна сторінка користувача, бере участь лише в порівнянні.';

-- Власна сторінка в сесії рівно одна. Частковий унікальний індекс тримає це
-- в базі, а не лише в коді: без нього обірваний запит на заміну лишив би
-- дві «власні» сторінки, і яка з них справжня, не сказав би ніхто.
create unique index if not exists session_analyses_own_idx
  on public.session_analyses (session_id)
  where role = 'own';

-- Звіт порівняння — одним JSON поряд із ТЗ і з тих самих міркувань:
-- читається й пишеться цілком, а розкладання на таблиці означало б
-- дублювати zod-схему в SQL.
alter table public.sessions
  add column if not exists comparison jsonb;

comment on column public.sessions.comparison is
  'Останній звіт порівняння власної сторінки з конкурентами. Прив''язаний до URL і дати всередині себе: сторінки могли змінитися після порівняння.';

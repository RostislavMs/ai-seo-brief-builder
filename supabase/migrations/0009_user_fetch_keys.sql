-- Ключі платних сервісів доступу до сторінок.
--
-- Виконати у Supabase → SQL Editor після 0001–0008.
-- Скрипт ідемпотентний: повторний запуск нічого не ламає.
--
-- Каскад доступу (server/services/fetcher/acquire.ts) має платні ступені, і
-- досі їхні ключі жили лише в змінних оточення — тобто за кожен важкий сайт
-- платив власник сервера, за всіх користувачів разом і зі спільного ліміту.
--
-- Ця таблиця дає ту саму розв'язку, що вже зроблена для AI: ключ належить
-- акаунту. Хто додав — той і платить, ліміт у нього власний, а користувачі
-- без ключа просто не отримують платних ступеней каскаду. Безкоштовна частина
-- працює для всіх однаково й від цієї таблиці не залежить.
--
-- Окрема таблиця, а не user_ai_keys: там кожен рядок зобов'язаний мати model,
-- а активний провайдер вибирається один із трьох. Тут немає ні моделі, ні
-- вибору — сервіси не заміняють один одного, а лише додають каскаду ступені,
-- тому ключі всіх сервісів діють одночасно.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'fetch_service') then
    create type public.fetch_service as enum ('firecrawl');
  end if;
end
$$;

create table if not exists public.user_fetch_keys (
  user_id uuid not null references auth.users (id) on delete cascade,
  service public.fetch_service not null,

  -- Шифрування те саме, що для AI-ключів: AES-256-GCM ключем
  -- NITRO_ENCRYPTION_KEY (server/lib/crypto.ts). Три колонки, бо GCM
  -- перевіряє цілісність — без auth_tag підміна шифротексту лишилась би
  -- непоміченою.
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,

  -- Останні символи ключа — щоб користувач упізнав свій ключ у списку.
  hint text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Один ключ на сервіс: додавання другого замінює перший (upsert).
  primary key (user_id, service)
);

comment on table public.user_fetch_keys is
  'RLS увімкнено без жодної політики: рядки доступні лише сервісному ключу. Клієнт отримує ключі виключно через /api/fetch-keys, і завжди без секрету — лише hint.';

comment on column public.user_fetch_keys.service is
  'Сервіс доступу до сторінок. Перелік дублює FetchServiceId у packages/shared/src/types/account.ts — додаючи значення тут, додайте його й там.';

-- updated_at сам себе не оновить: тригерна функція є з 0001, але вішається
-- на кожну таблицю окремо, і цикл у 0001 знав лише про тодішні чотири.
drop trigger if exists touch_user_fetch_keys_updated_at on public.user_fetch_keys;

create trigger touch_user_fetch_keys_updated_at
  before update on public.user_fetch_keys
  for each row execute function public.touch_updated_at();

-- Як і user_ai_keys, навмисно лишається без політик: жодна роль, крім
-- сервісної, не має бачити навіть зашифрований ключ.
alter table public.user_fetch_keys enable row level security;

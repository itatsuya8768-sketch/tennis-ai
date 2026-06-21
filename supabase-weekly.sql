-- =====================================================
-- 週次フォーム改善メニュー（Premium限定）
-- Supabase Dashboard → SQL Editor に貼り付けて実行
-- =====================================================

create table if not exists weekly_menus (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  week_start  date not null,            -- その週の月曜日（UTC）
  menu        jsonb not null,           -- AIが生成した改善メニュー
  diagnosis_count int not null default 0,
  created_at  timestamptz default now() not null,

  unique (user_id, week_start)
);

alter table weekly_menus enable row level security;

create policy "users can crud own weekly menus"
  on weekly_menus for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

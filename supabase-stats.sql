-- サイト訪問記録テーブル（統計用）
-- Supabase の SQL Editor で実行してください。
create table if not exists public.visits (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  path       text
);

-- RLS を有効化（クライアントからの直接アクセスは不可。
-- 記録・集計は API が service_role キーで行うため RLS をバイパスする）
alter table public.visits enable row level security;

-- 集計を速くするためのインデックス
create index if not exists visits_created_at_idx on public.visits (created_at);

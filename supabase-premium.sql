-- =====================================================
-- Premium / 課金用スキーマ（無料3回制限 & Stripe連携の土台）
-- Supabase Dashboard → SQL Editor に貼り付けて Run
-- =====================================================

-- ユーザーごとの課金状態
create table if not exists profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  is_premium             boolean not null default false,
  stripe_customer_id     text,
  stripe_subscription_id text,
  current_period_end     timestamptz,
  updated_at             timestamptz default now()
);

-- RLS 有効化
alter table profiles enable row level security;

-- ユーザーは自分の課金状態を読み取れる（更新はしない＝Stripe Webhookがservice_roleで更新）
drop policy if exists "users can read own profile" on profiles;
create policy "users can read own profile"
  on profiles for select
  using (auth.uid() = id);

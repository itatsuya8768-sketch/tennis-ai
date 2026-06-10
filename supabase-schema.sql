-- =====================================================
-- tennis-ai Supabase スキーマ
-- Supabase Dashboard → SQL Editor に貼り付けて実行
-- =====================================================

-- 診断履歴テーブル
create table if not exists diagnoses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  created_at  timestamptz default now() not null,

  -- プレイヤーカルテ入力値
  handedness      text not null,          -- '右利き' | '左利き'
  forehand        text not null,          -- '片手打ち' | '両手打ち'
  forehand_grip   text,                   -- 両手時: '順手' | '逆手'
  backhand        text not null,          -- '片手打ち' | '両手打ち'
  pain_areas      jsonb default '[]',     -- string[]
  pain_levels     jsonb default '{}',     -- { area: 1-4 }

  -- AI診断結果
  ai_report       jsonb,                  -- { formScore, injuryRisk, ... }
  ai_text         text,                   -- Claudeが生成した診断テキスト全文

  -- 動画サムネ（Supabase Storage パス）
  video_path      text,
  thumbnail_path  text
);

-- RLS（Row Level Security）有効化
alter table diagnoses enable row level security;

-- ユーザーは自分のデータのみ読み書き可
create policy "users can crud own diagnoses"
  on diagnoses for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Supabase Storage バケット作成
insert into storage.buckets (id, name, public)
values ('tennis-videos', 'tennis-videos', false)
on conflict do nothing;

-- Storage RLS
create policy "users can upload own videos"
  on storage.objects for insert
  with check (bucket_id = 'tennis-videos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "users can read own videos"
  on storage.objects for select
  using (bucket_id = 'tennis-videos' and auth.uid()::text = (storage.foldername(name))[1]);

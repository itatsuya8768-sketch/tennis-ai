# TennisAI セットアップ手順書
**プログラミング未経験でも1時間以内にデプロイできます**

---

## 必要なもの（すべて無料）
- [Node.js](https://nodejs.org/ja/) v18以上
- [Git](https://git-scm.com/)
- [Supabase](https://supabase.com/) アカウント
- [Anthropic](https://console.anthropic.com/) APIキー
- [Vercel](https://vercel.com/) アカウント（GitHubで登録）

---

## STEP 1：Node.js のインストール確認

ターミナル（Mac: Terminal / Windows: コマンドプロンプト）を開いて：

```bash
node -v
```

`v18.x.x` 以上が表示されればOK。

---

## STEP 2：プロジェクトをローカルで起動

```bash
# このフォルダに移動
cd tennis-ai

# 依存パッケージをインストール（2〜3分かかります）
npm install

# .env.local を作成
cp .env.local.example .env.local
```

---

## STEP 3：Supabase のセットアップ

1. [supabase.com](https://supabase.com) にアクセス → **Start your project**
2. 新しいプロジェクトを作成（名前: `tennis-ai`、パスワードをメモ）
3. 作成完了後、**Settings → API** を開く
4. 以下の値をコピーして `.env.local` に貼り付け：
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY`

5. **SQL Editor** を開いて `supabase-schema.sql` の内容を貼り付け → **Run**

6. （任意）Googleログインを有効化：
   - **Authentication → Providers → Google** をON
   - Google Cloud ConsoleでOAuthクライアントIDを取得して設定

---

## STEP 4：Anthropic APIキーの取得

1. [console.anthropic.com](https://console.anthropic.com) にアクセス
2. **API Keys** → **Create Key**
3. キーをコピーして `.env.local` の `ANTHROPIC_API_KEY` に貼り付け

---

## STEP 5：ローカルで動作確認

```bash
npm run dev
```

ブラウザで http://localhost:3000 を開いてください。

動画をアップロードして「AI精密診断を開始する」を押すと：
- MediaPipeで骨格検出（緑の線が表示されます）
- Claude AIがリアルな診断テキストを生成
- Supabaseに履歴が保存されます

---

## STEP 6：Vercel にデプロイ（公開）

### 6-1. GitHubにプッシュ

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/あなたのユーザー名/tennis-ai.git
git push -u origin main
```

### 6-2. Vercelと連携

1. [vercel.com](https://vercel.com) にGitHubでログイン
2. **New Project** → GitHubリポジトリ `tennis-ai` を選択 → **Import**
3. **Environment Variables** に以下を追加：

| 変数名 | 値 |
|--------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | SupabaseのProject URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabaseのanon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabaseのservice_role key |
| `ANTHROPIC_API_KEY` | AnthropicのAPIキー |

4. **Deploy** ボタンを押す → 2〜3分で完了！
5. 発行されたURL（例: `tennis-ai.vercel.app`）でアクセス可能に

### 6-3. SupabaseのリダイレクトURL設定

Vercelデプロイ後：
- Supabase → **Authentication → URL Configuration**
- `Site URL` に `https://tennis-ai.vercel.app` を設定
- `Redirect URLs` に `https://tennis-ai.vercel.app/api/auth` を追加

---

## よくあるエラーと対処法

### `Error: ANTHROPIC_API_KEY is not set`
→ `.env.local` にAPIキーが正しく設定されているか確認

### `Error: Invalid Supabase credentials`
→ Supabaseの `anon key` が正しいか確認。`service_role key` と混同しやすいので注意

### MediaPipeが動かない
→ ブラウザのカメラ・動画権限を確認。HTTPSまたはlocalhostでのみ動作します

### ビルドエラー `Module not found`
→ `npm install` を再実行してください

---

## ファイル構成

```
tennis-ai/
├── app/
│   ├── page.tsx          # メイン診断画面
│   ├── login/page.tsx    # ログイン
│   ├── signup/page.tsx   # 新規登録
│   ├── history/page.tsx  # 診断履歴
│   ├── api/
│   │   ├── analyze/      # Claude AI診断API
│   │   ├── auth/         # Supabase認証コールバック
│   │   └── history/      # 履歴取得API
│   └── globals.css
├── components/
│   ├── AuthButton.tsx    # ログイン/ログアウトボタン
│   ├── PoseDetector.tsx  # MediaPipe骨格検出
│   ├── ScoreBar.tsx      # スコアバーUI
│   └── ReportCard.tsx    # レポートカードUI
├── lib/supabase/         # Supabaseクライアント
├── types/index.ts        # TypeScript型定義
├── supabase-schema.sql   # DBスキーマ（Supabaseに貼り付け）
├── .env.local.example    # 環境変数テンプレート
└── vercel.json           # Vercelデプロイ設定
```

---

## 次のステップ（将来の拡張）

- **Stripe決済**: `@stripe/stripe-js` + Stripe Checkout でPremiumプランの課金を実装
- **動画サムネイル**: `ffmpeg.wasm` でブラウザ内でサムネイルを自動生成
- **PDF出力**: 診断レポートをPDFとしてダウンロード
- **コーチ共有機能**: 診断結果のURLを生成してコーチに送付

---

**質問があればいつでも聞いてください！**

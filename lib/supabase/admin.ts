import { createClient } from "@supabase/supabase-js";

// service_role キーで動作する管理用クライアント（RLSをバイパス）
// Webhook など「ユーザーのセッションが無い」サーバー処理で profiles を更新するのに使う
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

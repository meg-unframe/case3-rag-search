import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

/**
 * Secret key を使う管理用クライアント（RLS をバイパス）。
 * 取り込みスクリプト（scripts/）とサーバー側の検索処理だけで使う。
 * クライアントコンポーネントから import しないこと。
 */
export function createSupabaseAdminClient() {
  requireEnv("supabasePublic", "supabaseSecret");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

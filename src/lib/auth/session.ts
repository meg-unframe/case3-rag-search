import "server-only";
import type { User } from "@supabase/supabase-js";
import { connection } from "next/server";
import { isEmailAllowed, parseAllowedDomains } from "@/lib/auth/allowed-domains";
import { missingEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthResult =
  | { ok: true; user: User }
  | { ok: false; status: 401 | 403 | 503; reason: string };

/**
 * 検索 API・ページで使う認可チェック（本番の判定はここ。proxy.ts は画面遷移用の楽観チェック）。
 * 1. Supabase Auth でトークンを検証（getUser はサーバーに問い合わせるので改ざんに強い）
 * 2. メールドメインが ALLOWED_EMAIL_DOMAINS に含まれるか
 *    → Supabase 側の公開サインアップ API を直接叩かれても、ここで拒否できる
 */
export async function authorizeRequest(): Promise<AuthResult> {
  // 環境変数の有無に関わらず必ずリクエスト時に評価する
  // （ビルド時に「設定未完了」の画面が静的生成されて固定されるのを防ぐ）
  await connection();
  const missing = missingEnv("supabasePublic", "auth");
  if (missing.length > 0) {
    return { ok: false, status: 503, reason: "サーバーの認証設定が未完了です" };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { ok: false, status: 401, reason: "ログインが必要です" };

  const allowed = parseAllowedDomains(process.env.ALLOWED_EMAIL_DOMAINS);
  if (!isEmailAllowed(data.user.email, allowed)) {
    return { ok: false, status: 403, reason: "このメールアドレスでは利用できません" };
  }
  return { ok: true, user: data.user };
}

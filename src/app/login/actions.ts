"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { isEmailAllowed, parseAllowedDomains } from "@/lib/auth/allowed-domains";
import { missingEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LoginState = { error?: string; message?: string };

const credentials = z.object({
  email: z.email("メールアドレスの形式が正しくありません"),
  password: z.string().min(8, "パスワードは8文字以上にしてください"),
});

function parse(formData: FormData) {
  return credentials.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });
}

function checkConfigured(): string | undefined {
  if (missingEnv("supabasePublic", "auth").length > 0) {
    return "認証の設定が未完了です（README の「外部サービスの設定」を参照）";
  }
}

function checkDomain(email: string): string | undefined {
  if (!isEmailAllowed(email, parseAllowedDomains(process.env.ALLOWED_EMAIL_DOMAINS))) {
    return "このメールアドレスのドメインは許可されていません";
  }
}

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const notReady = checkConfigured();
  if (notReady) return { error: notReady };
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const domainError = checkDomain(parsed.data.email);
  if (domainError) return { error: domainError };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  // 認証失敗の理由（未登録 / パスワード違い / 未確認）は区別して出さない
  if (error) return { error: "メールアドレスまたはパスワードが正しくありません" };
  redirect("/");
}

export async function signUp(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const notReady = checkConfigured();
  if (notReady) return { error: notReady };
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const domainError = checkDomain(parsed.data.email);
  if (domainError) return { error: domainError };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp(parsed.data);
  if (error) return { error: "登録できませんでした。時間をおいて再度お試しください" };
  return { message: "確認メールを送信しました。メール内のリンクを開いてからログインしてください" };
}

export async function signOut(): Promise<void> {
  if (missingEnv("supabasePublic").length === 0) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}

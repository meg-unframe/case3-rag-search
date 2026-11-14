import { z } from "zod";

const email = z.email("メールアドレスの形式が正しくありません");

/** ログイン: 空欄だけを弾き、長さの判定は Supabase に任せる（既存アカウントのパスワード規則に依存しない） */
export const signInSchema = z.object({
  email,
  password: z.string().min(1, "パスワードを入力してください"),
});

/** 新規登録: 8文字以上を必須にする */
export const signUpSchema = z.object({
  email,
  password: z.string().min(8, "パスワードは8文字以上にしてください"),
});

export type CredentialsSchema = typeof signInSchema | typeof signUpSchema;

export function parseCredentials(schema: CredentialsSchema, formData: FormData) {
  return schema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });
}

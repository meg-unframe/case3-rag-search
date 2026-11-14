import { describe, expect, it } from "vitest";
import { parseCredentials, signInSchema, signUpSchema } from "./credentials";

const form = (email: string, password: string) => {
  const f = new FormData();
  f.set("email", email);
  f.set("password", password);
  return f;
};

describe("ログイン（signInSchema）", () => {
  it("7文字のパスワードも通し、Supabase の認証に委ねる", () => {
    expect(parseCredentials(signInSchema, form("user@example.com", "a".repeat(7))).success).toBe(true);
  });
  it("1文字でも空欄でなければ通す", () => {
    expect(parseCredentials(signInSchema, form("user@example.com", "x")).success).toBe(true);
  });
  it("空欄は弾く", () => {
    const r = parseCredentials(signInSchema, form("user@example.com", ""));
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("パスワードを入力してください");
  });
  it("メール形式が不正なら弾く", () => {
    expect(parseCredentials(signInSchema, form("not-an-email", "abcdefg")).success).toBe(false);
  });
});

describe("新規登録（signUpSchema）", () => {
  it("7文字は弾く（8文字以上の制限を維持）", () => {
    const r = parseCredentials(signUpSchema, form("user@example.com", "a".repeat(7)));
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("パスワードは8文字以上にしてください");
  });
  it("8文字は通す", () => {
    expect(parseCredentials(signUpSchema, form("user@example.com", "a".repeat(8))).success).toBe(true);
  });
});

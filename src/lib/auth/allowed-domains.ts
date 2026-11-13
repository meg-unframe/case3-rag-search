// 許可メールドメインの判定。
// ALLOWED_EMAIL_DOMAINS="example.com,school.example.jp" のようにカンマ区切りで設定する。
// 未設定・空のときは「誰も許可しない」（設定漏れで全開放にならないよう fail-closed）。

export function parseAllowedDomains(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter((d) => d.length > 0);
}

/** ドメインは完全一致のみ（サブドメインや末尾一致は許可しない） */
export function isEmailAllowed(email: string | null | undefined, allowed: string[]): boolean {
  if (!email || allowed.length === 0) return false;
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return allowed.includes(domain);
}

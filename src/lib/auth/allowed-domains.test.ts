import { describe, expect, it } from "vitest";
import { isEmailAllowed, parseAllowedDomains } from "./allowed-domains";

describe("parseAllowedDomains", () => {
  it("カンマ区切り・空白・@・大文字を正規化する", () => {
    expect(parseAllowedDomains(" Example.com, @school.example.jp ,, ")).toEqual([
      "example.com",
      "school.example.jp",
    ]);
  });
  it("未設定なら空配列", () => {
    expect(parseAllowedDomains(undefined)).toEqual([]);
  });
});

describe("isEmailAllowed", () => {
  const allowed = ["example.com"];
  it.each([
    ["user@example.com", true],
    ["USER@Example.COM", true],
    ["user@sub.example.com", false], // サブドメインは不可
    ["user@example.com.evil.test", false],
    ["user@notexample.com", false],
    ["example.com", false],
    ["@example.com", false],
    [null, false],
  ])("%s → %s", (email, expected) => {
    expect(isEmailAllowed(email, allowed)).toBe(expected);
  });
  it("許可リストが空なら誰も許可しない（fail-closed）", () => {
    expect(isEmailAllowed("user@example.com", [])).toBe(false);
  });
});

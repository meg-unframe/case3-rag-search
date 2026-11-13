// PDF 抽出テキストの正規化。
// 教材 PDF は「⽇」(U+2F47 康煕部首) のように部首文字で漢字が出力されるため、
// NFKC で通常の漢字 (U+65E5 日) に寄せないと検索も表示も崩れる。

// CJK部首補助 (U+2E80–U+2EFF) は NFKC でも統合漢字に変換されないため個別に対応する。
// 教材 PDF で実際に出現したもの + 日本語で出やすいもの（Unicode 名で確認済み）を登録。
// 未登録の部首は scanRadicals で検出できる（npm run ingest:dry が警告を出す）。
const RADICAL_SUPPLEMENT_MAP: Record<string, string> = {
  "⺠": "民", // ⺠ CJK RADICAL CIVILIAN（教材に出現）
  "⻑": "長", // ⻑ CJK RADICAL LONG ONE（教材に出現）
  "⺟": "母", // ⺟ CJK RADICAL MOTHER
  "⻄": "西", // ⻄ CJK RADICAL WEST TWO
  "⻘": "青", // ⻘ CJK RADICAL BLUE
  "⻝": "食", // ⻝ CJK RADICAL EAT ONE
  "⻤": "鬼", // ⻤ CJK RADICAL GHOST
};

/** 正規化後も残っている部首文字（要マッピング追加）を返す */
export function scanRadicals(text: string): string[] {
  return [...new Set([...text].filter((ch) => /[⺀-⿟]/.test(ch)))];
}

export function normalizeText(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/[⺀-⻿]/g, (ch) => RADICAL_SUPPLEMENT_MAP[ch] ?? ch)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t　]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 句点等で終わる行（=段落の終わり） */
const SENTENCE_END = /[。！？!?」）)]$/;

/**
 * セクション見出しの判定。
 * - 「第2章 休日・休暇」「1. パスワード管理」のような短い行
 * - 「1. 利用したいツールを申請する。」のような番号付き手順（句点で終わる）は見出しではない
 */
export function isHeading(line: string): boolean {
  if (line.length === 0 || line.length > 30) return false;
  if (/[。]$/.test(line)) return false;
  return /^第\s*\d+\s*章\s*\S/.test(line) || /^\d+\.\s*\S/.test(line);
}

/**
 * PDF の折り返しで分断された文を 1 行に戻す。
 * 折り返し行は本文幅いっぱい（概ね 35 文字以上）で句点がないことを手掛かりにする。
 * 短い行（箇条書き・表の行）はそのまま残す。
 */
export function joinWrappedLines(lines: string[], wrapMinLength = 35): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const prev = out.at(-1);
    if (
      prev !== undefined &&
      prev.length >= wrapMinLength &&
      !SENTENCE_END.test(prev) &&
      !isHeading(prev) &&
      !isHeading(line) &&
      line.length > 0
    ) {
      out[out.length - 1] = prev + line;
    } else {
      out.push(line);
    }
  }
  return out;
}

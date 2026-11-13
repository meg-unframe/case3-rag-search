import type { Chunk, PageText } from "@/lib/types";
import { isHeading, joinWrappedLines } from "./normalize";

export type ChunkOptions = {
  /** 1 チャンクの最大文字数（本文のみ）。超える場合は行単位で分割 */
  maxChars: number;
  /** 分割時に前チャンクから重ねる行数 */
  overlapLines: number;
};

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = { maxChars: 500, overlapLines: 1 };

const PREAMBLE_HEADING = "文書情報";

/**
 * 1 文書（複数ページ）をセクション単位のチャンクに分割する。
 *
 * 方針:
 * - チャンクはページをまたがない → 出典ページ番号が常に正確
 * - 見出しはページをまたいで引き継ぐ → p.2 の続き本文にも「4. アカウント申請の流れ」の文脈が付く
 * - 1 ページ目冒頭（タイトル・改定日など、最初の見出しより前）は「文書情報」チャンク
 * - embeddingText には「文書タイトル > 見出し」を前置して検索精度を上げる
 */
export function chunkDocument(
  pages: PageText[],
  options: ChunkOptions = DEFAULT_CHUNK_OPTIONS,
): Chunk[] {
  if (pages.length === 0) return [];
  const fileName = pages[0].fileName;
  const docTitle = pages[0].text.split("\n")[0]?.trim() || fileName;

  const chunks: Chunk[] = [];
  let heading: string | null = PREAMBLE_HEADING;

  const flush = (page: number, h: string | null, body: string[]) => {
    const lines = body.filter((l) => l.length > 0);
    if (lines.length === 0) return;
    for (const part of splitLines(lines, options)) {
      const content = part.join("\n");
      chunks.push({
        fileName,
        docTitle,
        page,
        chunkIndex: chunks.length,
        heading: h,
        content,
        embeddingText: `${docTitle} > ${h ?? ""}\n${content}`,
      });
    }
  };

  for (const { page, text } of pages) {
    const lines = joinWrappedLines(text.split("\n").map((l) => l.trim()));
    let body: string[] = [];
    for (const line of lines) {
      if (isHeading(line)) {
        flush(page, heading, body);
        heading = line;
        body = [];
      } else {
        body.push(line);
      }
    }
    flush(page, heading, body); // ページ末で必ず区切る（見出しは次ページへ引き継ぐ）
  }
  return chunks;
}

function splitLines(lines: string[], { maxChars, overlapLines }: ChunkOptions): string[][] {
  const parts: string[][] = [];
  let cur: string[] = [];
  let len = 0;
  for (const line of lines) {
    if (cur.length > 0 && len + line.length > maxChars) {
      parts.push(cur);
      cur = overlapLines > 0 ? cur.slice(-overlapLines) : [];
      len = cur.reduce((n, l) => n + l.length, 0);
    }
    cur.push(line);
    len += line.length;
  }
  if (cur.length > 0) parts.push(cur);
  return parts;
}

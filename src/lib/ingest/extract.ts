import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { extractText } from "unpdf";
import type { PageText } from "@/lib/types";
import { normalizeText } from "./normalize";

/** PDF をページごとに抽出し、ファイル名とページ番号（1 始まり）を付けて返す */
export async function extractPdfPages(filePath: string): Promise<PageText[]> {
  const data = new Uint8Array(await readFile(filePath));
  const { text } = await extractText(data, { mergePages: false });
  const fileName = basename(filePath);
  return text.map((t, i) => ({ fileName, page: i + 1, text: normalizeText(t) }));
}

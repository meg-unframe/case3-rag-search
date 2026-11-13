// 各ブランチ（ingest / search-api / chat-ui）が共有する契約。
// ここを変更する場合は main で変更してから各 worktree に取り込む。

/** 根拠がないときに返す固定文言（評価スクリプトもこの文字列で判定する） */
export const NOT_FOUND_MESSAGE = "該当する情報が見つかりません";

/** PDF から抽出した 1 ページ分のテキスト */
export type PageText = {
  fileName: string; // 例: "case3-doc1-employment-rules.pdf"
  page: number; // 1 始まり
  text: string; // 正規化済み
};

/** DB に保存する 1 チャンク（embedding 以外） */
export type Chunk = {
  fileName: string;
  docTitle: string;
  page: number;
  chunkIndex: number; // ファイル内の通し番号
  heading: string | null; // 所属セクション見出し（ページをまたいでも引き継ぐ）
  content: string; // 画面・プロンプトに出す本文
  embeddingText: string; // 文書名・見出しを前置した embedding 用テキスト
};

/** match_chunks RPC の戻り値 1 行 */
export type RetrievedChunk = {
  id: number;
  file_name: string;
  doc_title: string;
  page: number;
  heading: string | null;
  content: string;
  similarity: number;
};

export type Citation = {
  fileName: string;
  page: number;
  heading: string | null;
};

/** POST /api/search のリクエスト / レスポンス */
export type SearchRequest = { question: string };

export type SearchResponse = {
  found: boolean;
  answer: string;
  citations: Citation[];
};

export type ApiError = { error: string };

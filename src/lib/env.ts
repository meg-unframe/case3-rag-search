// 環境変数の読み出し。値そのものはログに出さない（名前だけを出す）。
// 未設定でもアプリ全体が落ちないよう、使う場所で必要なものだけを要求する。

export const ENV_GROUPS = {
  /** ブラウザにも渡してよい値（公開鍵） */
  supabasePublic: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
  /** サーバー / 取り込みスクリプト専用。RLS をバイパスするので絶対に NEXT_PUBLIC_ を付けない */
  supabaseSecret: ["SUPABASE_SECRET_KEY"],
  voyage: ["VOYAGE_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  auth: ["ALLOWED_EMAIL_DOMAINS"],
} as const;

type GroupName = keyof typeof ENV_GROUPS;

export class MissingEnvError extends Error {
  constructor(public readonly names: string[]) {
    super(`環境変数が未設定です: ${names.join(", ")}`);
    this.name = "MissingEnvError";
  }
}

export function missingEnv(...groups: GroupName[]): string[] {
  return groups.flatMap((g) => ENV_GROUPS[g]).filter((n) => !process.env[n]);
}

export function requireEnv(...groups: GroupName[]): void {
  const missing = missingEnv(...groups);
  if (missing.length > 0) throw new MissingEnvError(missing);
}

/** Embedding 設定（公式資料で確認: voyage-4 は既定 1024 次元） */
export const EMBEDDING = {
  endpoint: process.env.VOYAGE_API_URL ?? "https://api.voyageai.com/v1/embeddings",
  model: "voyage-4",
  dimension: 1024, // supabase/migrations の vector(1024) と一致させること
} as const;

export const RETRIEVAL = {
  matchCount: Number(process.env.RAG_MATCH_COUNT ?? 5),
  /** cosine 類似度のしきい値。これ未満しかなければ Claude を呼ばず「該当なし」。評価で調整する */
  matchThreshold: Number(process.env.RAG_MATCH_THRESHOLD ?? 0.5),
} as const;

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";

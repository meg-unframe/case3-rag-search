// Voyage AI Embedding クライアント（ingest と search-api の共通部品）
// 公式: POST https://api.voyageai.com/v1/embeddings
//   body: { input: string[], model, input_type: "query" | "document" }
//   resp: { data: [{ embedding: number[], index }], model, usage: { total_tokens } }
import { EMBEDDING, requireEnv } from "@/lib/env";

export type InputType = "query" | "document";

export class VoyageError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "VoyageError";
  }
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type EmbedOptions = {
  /** 1 リクエストあたりの件数（公式上限 1,000。余裕を持たせる） */
  batchSize?: number;
  /** 429 / 5xx の再試行回数 */
  maxRetries?: number;
  /** 再試行の待ち時間の基準（attempt ごとに 2 倍）。無料枠の RPM 制限には長め（例: 20 秒）を指定する */
  baseDelayMs?: number;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * テキスト配列を Embedding に変換する。返り値は入力と同じ順序。
 * 文書は input_type: "document"、質問は "query" を必ず指定する（公式推奨）。
 */
export async function embedTexts(
  texts: string[],
  inputType: InputType,
  { batchSize = 64, maxRetries = 2, baseDelayMs = 500, fetchImpl = fetch, sleep = defaultSleep }: EmbedOptions = {},
): Promise<number[][]> {
  if (texts.length === 0) return [];
  requireEnv("voyage");
  const apiKey = process.env.VOYAGE_API_KEY!.trim();

  const out: number[][] = [];
  for (let start = 0; start < texts.length; start += batchSize) {
    const batch = texts.slice(start, start + batchSize);
    const vectors = await requestWithRetry(batch, inputType, apiKey, fetchImpl, sleep, maxRetries, baseDelayMs);
    out.push(...vectors);
  }
  return out;
}

export async function embedQuery(text: string, options?: EmbedOptions): Promise<number[]> {
  const [v] = await embedTexts([text], "query", options);
  return v;
}

async function requestWithRetry(
  batch: string[],
  inputType: InputType,
  apiKey: string,
  fetchImpl: FetchLike,
  sleep: (ms: number) => Promise<void>,
  maxRetries: number,
  baseDelayMs: number,
): Promise<number[][]> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(EMBEDDING.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ input: batch, model: EMBEDDING.model, input_type: inputType }),
      });
    } catch (e) {
      if (attempt < maxRetries) {
        await sleep(baseDelayMs * 2 ** attempt);
        continue;
      }
      throw new VoyageError(`Voyage への通信に失敗しました（${e instanceof Error ? e.name : "unknown"}）`);
    }

    if (res.ok) return parseResponse(await res.json(), batch.length);

    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < maxRetries) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : baseDelayMs * 2 ** attempt);
      continue;
    }
    // エラー本文にキーは含まれないが、ログに残す量は最小限にする
    throw new VoyageError(`Voyage API エラー（HTTP ${res.status}）`, res.status);
  }
}

function parseResponse(body: unknown, expected: number): number[][] {
  const data = (body as { data?: { embedding?: unknown; index?: number }[] })?.data;
  if (!Array.isArray(data) || data.length !== expected) {
    throw new VoyageError(`Embedding の件数が不正です（期待 ${expected} 件）`);
  }
  const sorted = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return sorted.map((d) => {
    const v = d.embedding;
    if (!Array.isArray(v) || v.length !== EMBEDDING.dimension || !v.every((x) => typeof x === "number" && Number.isFinite(x))) {
      throw new VoyageError(`Embedding の次元が不正です（期待 ${EMBEDDING.dimension} 次元）`);
    }
    return v as number[];
  });
}

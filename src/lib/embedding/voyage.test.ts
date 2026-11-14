import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMBEDDING } from "@/lib/env";
import { embedQuery, embedTexts, VoyageError } from "./voyage";

const vec = (seed: number) => Array.from({ length: EMBEDDING.dimension }, (_, i) => (i === seed ? 1 : 0));

function okResponse(n: number, offset = 0, shuffle = false) {
  const data = Array.from({ length: n }, (_, i) => ({ embedding: vec(offset + i), index: i }));
  return new Response(JSON.stringify({ data: shuffle ? data.reverse() : data, model: "voyage-4" }), { status: 200 });
}

describe("embedTexts", () => {
  beforeEach(() => vi.stubEnv("VOYAGE_API_KEY", "test-key"));
  afterEach(() => vi.unstubAllEnvs());

  it("input_type と model を送り、入力順で返す（index で並べ替え）", async () => {
    const fetchImpl = vi.fn(async () => okResponse(2, 0, true));
    const out = await embedTexts(["a", "b"], "document", { fetchImpl });
    expect(out.map((v) => v.indexOf(1))).toEqual([0, 1]);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ input: ["a", "b"], model: "voyage-4", input_type: "document" });
  });

  it("バッチに分割して送る", async () => {
    let offset = 0;
    const fetchImpl = vi.fn(async (_u: string, init: RequestInit) => {
      const n = JSON.parse(init.body as string).input.length;
      const r = okResponse(n, offset);
      offset += n;
      return r;
    });
    const out = await embedTexts(["1", "2", "3", "4", "5"], "document", { fetchImpl, batchSize: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(out.map((v) => v.indexOf(1))).toEqual([0, 1, 2, 3, 4]);
  });

  it("429 は再試行し、成功すれば結果を返す", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(okResponse(1));
    const sleep = vi.fn(async () => {});
    const v = await embedQuery("q", { fetchImpl, sleep });
    expect(v).toHaveLength(EMBEDDING.dimension);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("401 は再試行せずエラー（キーはメッセージに含めない）", async () => {
    const fetchImpl = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    const err = await embedQuery("q", { fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(VoyageError);
    expect(err.status).toBe(401);
    expect(String(err.message)).not.toContain("test-key");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("次元が違えばエラー（DB の vector(1024) と不一致を防ぐ）", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ data: [{ embedding: [1, 2, 3], index: 0 }] }), { status: 200 }),
    );
    await expect(embedQuery("q", { fetchImpl })).rejects.toThrow(/次元/);
  });

  it("空配列なら API を呼ばない", async () => {
    const fetchImpl = vi.fn();
    expect(await embedTexts([], "query", { fetchImpl })).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("embedTexts の再試行間隔", () => {
  beforeEach(() => vi.stubEnv("VOYAGE_API_KEY", "test-key"));
  afterEach(() => vi.unstubAllEnvs());

  it("baseDelayMs を基準に倍々で待つ（retry-after が無い場合）", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ embedding: Array(EMBEDDING.dimension).fill(0), index: 0 }] }), { status: 200 }),
      );
    const sleep = vi.fn(async () => {});
    await embedQuery("q", { fetchImpl, sleep, maxRetries: 4, baseDelayMs: 20_000 });
    expect(sleep.mock.calls.map((c) => (c as unknown as [number])[0])).toEqual([20_000, 40_000]);
  });
});

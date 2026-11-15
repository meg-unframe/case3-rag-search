import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { EMBEDDING } from "@/lib/env";
import { warmDatabase } from "./warmup";

describe("warmDatabase", () => {
  it("match_chunks を 1 回だけ、何にも一致しない条件で呼ぶ", async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    await warmDatabase({ rpc } as unknown as SupabaseClient);
    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0] as unknown as [string, { query_embedding: number[]; match_threshold: number; match_count: number }];
    expect(name).toBe("match_chunks");
    expect(args.query_embedding).toHaveLength(EMBEDDING.dimension);
    expect(args.match_threshold).toBeGreaterThan(1); // 類似度は最大 1 → 本文を返さない
    expect(args.match_count).toBe(1);
  });

  it("DB エラーは例外にする（エラー本文はメッセージに含めない）", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: "42501", message: "permission denied secret detail" } }));
    const err = await warmDatabase({ rpc } as unknown as SupabaseClient).catch((e) => e);
    expect(String(err.message)).toContain("42501");
    expect(String(err.message)).not.toContain("secret detail");
  });

  it("Voyage・Claude を呼ばない（fetch を使わない）", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await warmDatabase({ rpc: async () => ({ data: [], error: null }) } as unknown as SupabaseClient);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

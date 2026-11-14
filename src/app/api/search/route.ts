import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeRequest } from "@/lib/auth/session";
import { VoyageError } from "@/lib/embedding/voyage";
import { MissingEnvError, missingEnv } from "@/lib/env";
import { AnswerGenerationError } from "@/lib/rag/generate";
import { answerQuestion } from "@/lib/rag/pipeline";
import { createTimer } from "@/lib/timing";
import type { ApiError, SearchResponse } from "@/lib/types";

const body = z.object({ question: z.string().trim().min(1).max(500) });

export async function POST(request: Request) {
  // 処理時間の内訳（auth / embed / search / generate / total）を Server-Timing で返す
  const timer = createTimer();
  const err = (status: number, error: string) =>
    NextResponse.json<ApiError>({ error }, { status, headers: { "Server-Timing": timer.header() } });

  // 1. 認可を最初に行う（未認証は API キーの有無に関係なく 401、許可外ドメインは 403）
  const auth = await timer.measure("auth", () => authorizeRequest());
  if (!auth.ok) return err(auth.status, auth.reason);

  // 2. 入力検証
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return err(400, "question（1〜500文字）を指定してください");

  // 3. 検索に必要な設定（値は出さず、未設定であることだけを返す）
  if (missingEnv("supabaseSecret", "voyage", "anthropic").length > 0) {
    return err(503, "検索機能の設定が未完了です");
  }

  try {
    const result = await answerQuestion(parsed.data.question, timer);
    return NextResponse.json<SearchResponse>(result, { headers: { "Server-Timing": timer.header() } });
  } catch (e) {
    // ログには種類とステータスだけを残す（質問文・キー・資料本文は出さない）
    if (e instanceof MissingEnvError) return err(503, "検索機能の設定が未完了です");
    if (e instanceof AnswerGenerationError) return err(502, e.message);
    if (e instanceof Anthropic.RateLimitError || (e instanceof VoyageError && e.status === 429)) {
      return err(429, "混み合っています。少し時間をおいて再度お試しください");
    }
    if (e instanceof Anthropic.APIError || e instanceof VoyageError) {
      console.error("[api/search] upstream", e.name, e.status);
      return err(502, "回答の生成に失敗しました。時間をおいて再度お試しください");
    }
    console.error("[api/search]", e instanceof Error ? e.name : "unknown");
    return err(500, "検索中にエラーが発生しました");
  }
}

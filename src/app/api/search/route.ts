import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeRequest } from "@/lib/auth/session";
import { MissingEnvError, missingEnv } from "@/lib/env";
import { answerQuestion, NotImplementedError } from "@/lib/rag/pipeline";
import type { ApiError, SearchResponse } from "@/lib/types";

const body = z.object({ question: z.string().trim().min(1).max(500) });

const err = (status: number, error: string) => NextResponse.json<ApiError>({ error }, { status });

export async function POST(request: Request) {
  // 1. 認可を最初に行う（未認証は API キーの有無に関係なく 401）
  const auth = await authorizeRequest();
  if (!auth.ok) return err(auth.status, auth.reason);

  // 2. 入力検証
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return err(400, "question（1〜500文字）を指定してください");

  // 3. 検索に必要な設定（値は出さず、未設定であることだけを返す）
  if (missingEnv("supabaseSecret", "voyage", "anthropic").length > 0) {
    return err(503, "検索機能の設定が未完了です");
  }

  try {
    const result = await answerQuestion(parsed.data.question);
    return NextResponse.json<SearchResponse>(result);
  } catch (e) {
    if (e instanceof NotImplementedError) return err(501, e.message);
    if (e instanceof MissingEnvError) return err(503, "検索機能の設定が未完了です");
    console.error("[api/search]", e instanceof Error ? e.message : e);
    return err(500, "検索中にエラーが発生しました");
  }
}

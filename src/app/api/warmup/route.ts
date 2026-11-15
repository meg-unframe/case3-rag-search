import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth/session";
import { missingEnv } from "@/lib/env";
import { warmDatabase } from "@/lib/rag/warmup";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createTimer } from "@/lib/timing";
import type { ApiError } from "@/lib/types";

// チャット画面表示時に 1 回呼ばれ、関数の起動と Supabase（Auth・DB）への初回接続を済ませる。
// 検索 API と同じ認可（未認証 401 / 許可外ドメイン 403）。Voyage・Claude は呼ばない。
export async function POST() {
  const timer = createTimer();
  const headers = () => ({ "Server-Timing": timer.header(), "Cache-Control": "no-store" });

  const auth = await timer.measure("auth", () => authorizeRequest());
  if (!auth.ok) return NextResponse.json<ApiError>({ error: auth.reason }, { status: auth.status, headers: headers() });
  if (missingEnv("supabaseSecret").length > 0) {
    return NextResponse.json<ApiError>({ error: "検索機能の設定が未完了です" }, { status: 503, headers: headers() });
  }

  try {
    await timer.measure("db", () => warmDatabase(createSupabaseAdminClient()));
  } catch (e) {
    console.error("[api/warmup]", e instanceof Error ? e.name : "unknown");
    return NextResponse.json<ApiError>({ error: "準備に失敗しました" }, { status: 502, headers: headers() });
  }
  return new NextResponse(null, { status: 204, headers: headers() });
}

// Voyage Embedding と Claude 回答生成の最小接続確認（キー・設定値は表示しない）
// 使い方: npm run check:ai
// 送信するのは短いダミーテキストのみ。PDF や DB には触れない。
import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL, EMBEDDING } from "@/lib/env";

const has = (k: string) => (process.env[k] ?? "").trim().length > 0;
let failed = 0;
const ok = (msg: string) => console.log(`✅ ${msg}`);
const ng = (msg: string) => {
  failed++;
  console.log(`❌ ${msg}`);
};

// ---- 1. Voyage Embedding ----
console.log(`[Voyage] model=${EMBEDDING.model} / 期待次元=${EMBEDDING.dimension}`);
if (!has("VOYAGE_API_KEY")) ng("VOYAGE_API_KEY が未設定");
else {
  try {
    const res = await fetch(EMBEDDING.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.VOYAGE_API_KEY!.trim()}`,
      },
      body: JSON.stringify({
        input: ["接続確認用のダミーテキストです。"],
        model: EMBEDDING.model,
        input_type: "query",
      }),
    });
    if (!res.ok) {
      // エラー本文はキーを含まないが、念のため先頭だけ・キーらしき文字列を伏せて表示
      const text = (await res.text()).slice(0, 200).replace(/pa-[A-Za-z0-9_-]{8,}/g, "[redacted]");
      ng(`HTTP ${res.status}: ${text}`);
    } else {
      const body = (await res.json()) as {
        data?: { embedding?: number[] }[];
        model?: string;
        usage?: { total_tokens?: number };
      };
      const dim = body.data?.[0]?.embedding?.length ?? 0;
      const finite = body.data?.[0]?.embedding?.every(Number.isFinite) ?? false;
      if (dim === EMBEDDING.dimension && finite) {
        ok(`Embedding 取得成功（${dim} 次元 / model=${body.model} / ${body.usage?.total_tokens ?? "?"} tokens）`);
      } else ng(`次元が想定と異なる: ${dim}（DB は vector(${EMBEDDING.dimension})）`);
    }
  } catch (e) {
    ng(`通信エラー: ${e instanceof Error ? e.name : "unknown"}`);
  }
}

// ---- 2. Claude ----
console.log(`\n[Claude] model=${CLAUDE_MODEL}`);
if (!has("ANTHROPIC_API_KEY")) ng("ANTHROPIC_API_KEY が未設定");
else {
  const client = new Anthropic();
  try {
    const started = Date.now();
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: "接続確認です。「OK」とだけ返してください。" }],
    });
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    const ms = Date.now() - started;
    if (response.stop_reason === "end_turn" && text.length > 0) {
      ok(
        `応答取得成功（応答="${text.slice(0, 20)}" / model=${response.model} / stop=${response.stop_reason} / ` +
          `in=${response.usage.input_tokens} out=${response.usage.output_tokens} tokens / ${ms}ms）`,
      );
    } else {
      ng(`想定外の終了: stop_reason=${response.stop_reason} / text長=${text.length}`);
    }
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) ng("認証エラー（401）: キーが無効です");
    else if (error instanceof Anthropic.PermissionDeniedError) ng("権限エラー（403）: このキーでモデルを利用できません");
    else if (error instanceof Anthropic.NotFoundError) ng(`モデルが見つかりません（404）: ${CLAUDE_MODEL}`);
    else if (error instanceof Anthropic.RateLimitError) ng("レート制限（429）: 時間をおいて再実行してください");
    else if (error instanceof Anthropic.BadRequestError) ng(`リクエスト不正（400）: ${error.message.slice(0, 200)}`);
    else if (error instanceof Anthropic.APIError) ng(`API エラー ${error.status ?? ""}: ${error.message.slice(0, 200)}`);
    else ng(`通信エラー: ${error instanceof Error ? error.name : "unknown"}`);
  }
}

console.log(failed === 0 ? "\n結果: 両方とも接続成功" : `\n結果: ${failed} 件失敗`);
process.exit(failed === 0 ? 0 : 1);

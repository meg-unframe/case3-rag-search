import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ANSWER_EFFORT, CLAUDE_MODEL } from "@/lib/env";
import type { RetrievedChunk } from "@/lib/types";
import { AnswerSchema, buildUserContent, type ModelAnswer, SYSTEM_PROMPT } from "./prompt";

export class AnswerGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnswerGenerationError";
  }
}

let client: Anthropic | undefined;
const getClient = () => (client ??= new Anthropic()); // ANTHROPIC_API_KEY を環境変数から読む

/**
 * 取得チャンクだけを根拠に Claude で回答を生成する。
 * - 構造化出力（found / answer / source_ids）で形式を保証
 * - 安全分類器による拒否時はサーバー側フォールバック（fallbacks: "default"）で別モデルが継続
 */
export async function generateAnswer(question: string, chunks: RetrievedChunk[]): Promise<ModelAnswer> {
  const response = await getClient().beta.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: ANSWER_EFFORT, format: betaZodOutputFormat(AnswerSchema) },
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildUserContent(question, chunks) }],
  });

  if (response.stop_reason === "refusal") {
    throw new AnswerGenerationError("この質問には回答を生成できませんでした");
  }
  if (response.stop_reason === "max_tokens") {
    throw new AnswerGenerationError("回答が長すぎて途中で終了しました");
  }
  if (!response.parsed_output) {
    throw new AnswerGenerationError("回答の形式を解釈できませんでした");
  }
  return response.parsed_output;
}

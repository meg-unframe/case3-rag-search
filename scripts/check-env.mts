// 環境設定と Supabase 接続の確認（読み取りのみ。値は一切表示しない）
// 使い方: npm run check:env
import { createClient } from "@supabase/supabase-js";
import { parseAllowedDomains } from "@/lib/auth/allowed-domains";
import { EMBEDDING, ENV_GROUPS } from "@/lib/env";

type Result = { name: string; ok: boolean | null; note?: string };
const results: Result[] = [];
const add = (name: string, ok: boolean | null, note?: string) => results.push({ name, ok, note });
const env = (k: string) => (process.env[k] ?? "").trim();

// 1. 入力漏れ（名前だけ表示）
for (const [group, names] of Object.entries(ENV_GROUPS)) {
  for (const n of names) {
    const set = env(n).length > 0;
    const optionalNow = group === "voyage" || group === "anthropic";
    add(`入力: ${n}`, set ? true : optionalNow ? null : false, set ? undefined : optionalNow ? "未設定（今回は対象外）" : "未設定");
  }
}

// 2. 形式（OK/NG のみ）
const url = env("NEXT_PUBLIC_SUPABASE_URL");
let urlOk = false;
try {
  const u = new URL(url);
  urlOk = u.protocol === "https:" && /^[a-z0-9]{20}\.supabase\.co$/.test(u.hostname) && (u.pathname === "/" || u.pathname === "");
} catch {}
add("形式: SUPABASE_URL が https://<ref>.supabase.co", urlOk, urlOk ? undefined : "末尾の / やパス、http、空白がないか確認");

const pub = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const sec = env("SUPABASE_SECRET_KEY");
add("形式: Publishable key が sb_publishable_ で始まる", pub.startsWith("sb_publishable_"));
add("形式: Secret key が sb_secret_ で始まる", sec.startsWith("sb_secret_"));
add("形式: Publishable と Secret が別の値", pub.length > 0 && pub !== sec);
for (const k of Object.keys(process.env)) {
  if (k.startsWith("NEXT_PUBLIC_") && env(k).startsWith("sb_secret_")) add(`安全: ${k} に Secret key が入っていない`, false);
}
const raw = env("ALLOWED_EMAIL_DOMAINS");
const domains = parseAllowedDomains(raw);
const domainsOk = domains.length > 0 && domains.every((d) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) && !raw.includes("@");
add(`形式: ALLOWED_EMAIL_DOMAINS（${domains.length} 件）`, domainsOk, domainsOk ? undefined : "@ なし・カンマ区切りのドメイン名にしてください");

// 3. 接続（読み取りのみ）
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const safe = (e: { code?: string; message?: string } | null) => (e ? `${e.code ?? ""} ${e.message ?? ""}`.trim() : undefined);

if (urlOk && pub && sec) {
  // 3-1. Auth 設定（公開エンドポイント）
  try {
    const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: pub } });
    if (r.ok) {
      const s = (await r.json()) as { external?: { email?: boolean }; disable_signup?: boolean; mailer_autoconfirm?: boolean };
      add("接続: Supabase Auth に到達（Publishable key 有効）", true);
      add("Auth: メール認証プロバイダが有効", s.external?.email === true);
      add(`Auth: 新規登録 ${s.disable_signup ? "無効" : "有効"} / メール確認 ${s.mailer_autoconfirm ? "不要" : "必要"}`, null, "参考情報");
    } else add("接続: Supabase Auth に到達（Publishable key 有効）", false, `HTTP ${r.status}`);
  } catch (e) {
    add("接続: Supabase Auth に到達", false, e instanceof Error ? e.name : "error");
  }

  // 3-2. Secret key（service_role）で chunks を読み取り（件数のみ）
  const admin = createClient(url, sec, opts);
  const { count, error } = await admin.from("chunks").select("id", { count: "exact", head: true });
  add("読み取り: service_role で chunks を参照", !error, error ? safe(error) : `${count ?? 0} 行（取り込み前なので 0 が正常）`);

  // 3-3. 検索関数の実行権限（空テーブルへの読み取りのみ）
  const probe = Array.from({ length: EMBEDDING.dimension }, (_, i) => (i === 0 ? 1 : 0));
  const rpc = await admin.rpc("match_chunks", { query_embedding: probe, match_threshold: 0, match_count: 1 });
  add(`読み取り: service_role で match_chunks を実行（${EMBEDDING.dimension} 次元）`, !rpc.error, rpc.error ? safe(rpc.error) : `${rpc.data?.length ?? 0} 件`);

  // 3-4. ブラウザ側の鍵では読めないこと（拒否されるのが正常）
  const browser = createClient(url, pub, opts);
  const b = await browser.from("chunks").select("id", { head: true });
  add("拒否: Publishable key（anon）では chunks を読めない", Boolean(b.error), b.error ? safe(b.error) : "読めてしまった → 権限設定を確認");
  const brpc = await browser.rpc("match_chunks", { query_embedding: probe, match_threshold: 0, match_count: 1 });
  add("拒否: Publishable key（anon）では match_chunks を実行できない", Boolean(brpc.error), brpc.error ? safe(brpc.error) : "実行できてしまった");
} else {
  add("接続確認", null, "形式エラーのためスキップ");
}

const mark = (ok: boolean | null) => (ok === true ? "✅" : ok === false ? "❌" : "－");
for (const r of results) console.log(`${mark(r.ok)} ${r.name}${r.note ? `  … ${r.note}` : ""}`);
const failed = results.filter((r) => r.ok === false).length;
console.log(failed === 0 ? "\n結果: 問題なし" : `\n結果: ${failed} 件要確認`);
process.exit(failed === 0 ? 0 : 1);

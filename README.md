# 社内文書検索AI（案件3 / RAG）

社内規程 PDF を根拠に回答するチャット。回答にはファイル名とページ番号を表示し、根拠がなければ「該当する情報が見つかりません」と答える。

| 層 | 採用 |
|---|---|
| 画面・API | Next.js 16（App Router / `src/proxy.ts`） |
| 認証 | Supabase Auth（メール＋パスワード、許可ドメインは `ALLOWED_EMAIL_DOMAINS`） |
| ベクトル検索 | Supabase pgvector（`vector(1024)`、HNSW / cosine） |
| Embedding | Voyage AI `voyage-4`（1024 次元、文書 `input_type: "document"` / 質問 `"query"`） |
| 回答生成 | Claude API（`claude-opus-5-5`） |

## 進捗

| 範囲 | 状態 |
|---|---|
| CSV 補正（`data/eval/test-questions.csv`） | ✅ 完了（5・6 番の金額カンマを結合、全 12 問 6 列） |
| PDF 抽出・正規化・チャンク分割 | ✅ 完了（`npm run ingest` で計画表示のみ、キー・DB 不要） |
| ログイン画面・許可ドメイン判定・未認証 401 | ✅ 完了 |
| DB スキーマ（`supabase/migrations/0001_init.sql`） | ✅ 適用済み（service_role のみ読み書き可） |
| Embedding 保存（`npm run ingest -- --yes`） | ✅ 実装済み・**未実行**（DB は空） |
| 検索・回答生成（`src/lib/rag/`） | ✅ 実装済み（出典付き回答 / 該当なし判定） |
| 12 問評価スクリプト | ⏳ 未実装（取り込み後に feature/eval で実施） |

## コマンド

```bash
npm run dev          # 開発サーバー
npm test             # 単体テスト（キー不要）
npm run typecheck
npm run ingest:dry   # PDF 抽出・チャンク分割の確認（キー不要、DB に書かない）。--full で本文も表示
npm run eval:fix-csv # 教材 CSV を補正して data/eval/test-questions.csv を再生成
npm run check:env    # 設定・Supabase 接続の確認（値は表示しない、読み取りのみ）
npm run check:ai     # Voyage / Claude の最小接続確認
npm run check:search # 質問 Embedding→検索（読み取り）と Claude 回答をダミー資料で確認
npm run ingest       # 取り込み計画の表示のみ（API・DB に触れない）
npm run ingest -- --yes  # Embedding を作成して Supabase に保存（ファイル単位で入れ替え）
```

## 構成

```
data/pdfs/                 教材 PDF 5 本
data/eval/raw/             教材 CSV（原本・未補正）
data/eval/test-questions.csv  補正済みテスト質問 12 問
supabase/migrations/       DB スキーマ（SQL Editor で適用）
scripts/                   取り込み・CSV 補正・確認用スクリプト
src/lib/types.ts           ブランチ間で共有する型（変更は main で）
src/lib/ingest/            PDF 抽出・正規化・チャンク分割
src/lib/auth/              許可ドメイン判定・認可チェック
src/lib/embedding/voyage.ts Voyage Embedding（文書=document / 質問=query）
src/lib/rag/                検索（match_chunks）→ Claude 回答（構造化出力・出典検証）
src/app/api/search/        検索 API（認可 → 入力検証 → pipeline）
src/proxy.ts               セッション更新・未ログイン時のリダイレクト
```

### 設計メモ

- **チャンクはページをまたがない**ので、出典ページ番号は常に正確。見出しはページをまたいで引き継ぎ、Embedding 用テキストに「文書名 > 見出し」を前置する。
- 教材 PDF は `⽇`（康煕部首）・`⻑`（部首補助）のような文字で出力されるため、NFKC＋個別マップで通常の漢字に正規化する。
- 認可の本判定は API / ページ側の `authorizeRequest()`（`getUser()` でトークン検証＋許可ドメイン）。`proxy.ts` は画面遷移用の楽観チェックのみ。
- 許可ドメイン未設定時は誰もログインできない（fail-closed）。
- `chunks` テーブルは RLS 有効・ポリシーなし。読み書きは認可済みサーバーから secret key 経由のみ。
- 回答生成: 類似度しきい値（既定 0.3）を超える資料が 0 件なら Claude を呼ばずに「該当する情報が見つかりません」。
  Claude には取得資料だけを `<sources>` で渡し、`found / answer / source_ids` の構造化出力で返させる。
  出典は実際に取得した資料の id だけを採用し、有効な出典がなければ該当なしにする。

## 外部サービスの設定

> 秘密情報は `.env.local` にだけ書く（Git 管理外）。チャットやスクリーンショットに貼らない。

1. **Supabase プロジェクト作成**: 案件3専用の新規プロジェクト、Region は Northeast Asia (Tokyo)。
2. **スキーマ適用**: SQL Editor に `supabase/migrations/0001_init.sql` を貼り付けて実行。
3. **キー取得**: Project Settings > API Keys から URL・Publishable key・Secret key を `.env.local` へ。
4. **Auth 設定**（Authentication）:
   - Sign In / Providers で Email を有効化。
   - 学習用アカウントは Users > Add user で作成（Auto Confirm）するのを推奨。標準の SMTP は送信数の上限が小さいため。
   - 画面からの新規登録を使わない場合は「Allow new users to sign up」をオフにする。オンのままでも許可外ドメインは API で 403 になる。
   - URL Configuration の Site URL を `http://localhost:3000` に設定。
5. **Voyage AI**: 公式ダッシュボードで API キーを発行し、`VOYAGE_API_KEY` に設定。
6. **Anthropic**: Claude Console で API キーを発行し、`ANTHROPIC_API_KEY` に設定。

## 並列開発（git worktree）

main に共通部分（依存・型・スキーマ）をコミットしてから、作業ツリーを分ける。

```bash
git worktree add .worktrees/ingest -b feature/ingest      # Embedding 保存
git worktree add .worktrees/api    -b feature/search-api  # 検索・Claude 回答（PORT=3001）
git worktree add .worktrees/ui     -b feature/chat-ui     # 画面の仕上げ（PORT=3002）
# 各 worktree で npm install し、.env.local をコピー（中身は表示しない）
```

マージ順: ingest → search-api → chat-ui → 最後に feature/eval で 12 問評価。

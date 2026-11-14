# 社内文書検索AI（案件3 / RAG）

社内規程 PDF を根拠に回答するチャット。回答にはファイル名とページ番号を表示し、根拠がなければ「該当する情報が見つかりません」と答える。

| 層 | 採用 |
|---|---|
| 画面・API | Next.js 16（App Router / `src/proxy.ts`） |
| 認証 | Supabase Auth（メール＋パスワード、許可ドメインは `ALLOWED_EMAIL_DOMAINS`） |
| ベクトル検索 | Supabase pgvector（`vector(1024)`、HNSW / cosine） |
| Embedding | Voyage AI `voyage-4`（1024 次元、文書 `input_type: "document"` / 質問 `"query"`） |
| 回答生成 | Claude API（`claude-opus-5-5`、effort `medium`＝`RAG_CLAUDE_EFFORT`） |

## 進捗

| 範囲 | 状態 |
|---|---|
| CSV 補正（`data/eval/test-questions.csv`） | ✅ 完了（5・6 番の金額カンマを結合、全 12 問 6 列） |
| PDF 抽出・正規化・チャンク分割 | ✅ 完了（`npm run ingest` で計画表示のみ、キー・DB 不要） |
| ログイン画面・許可ドメイン判定・未認証 401 | ✅ 完了 |
| DB スキーマ（`supabase/migrations/0001_init.sql`） | ✅ 適用済み（service_role のみ読み書き可） |
| Embedding 保存（`npm run ingest -- --yes`） | ✅ 取り込み済み（PDF 5 本 / 34 チャンク、2026-11-14） |
| 検索・回答生成（`src/lib/rag/`） | ✅ 実装済み（出典付き回答 / 該当なし判定） |
| 12 問評価（`npm run eval`） | ✅ 実施済み（下記「評価結果」） |

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
npm run check:ingest # DB の取り込み状態を PDF と照合（読み取りのみ）
npm run eval         # 12 問評価（Voyage・Claude を各最大 12 回呼ぶ。約 4〜5 分）
```

## 評価結果（2026-11-14 実施）

### 対象データ

| ファイル | ページ | チャンク |
|---|---|---|
| case3-doc1-employment-rules.pdf | 2 | 6 |
| case3-doc2-expense-manual.pdf | 2 | 7 |
| case3-doc3-security-policy.pdf | 2 | 7 |
| case3-doc4-remote-work.pdf | 1 | 6 |
| case3-doc5-it-onboarding.pdf | 2 | 8 |
| **合計 5 ファイル** | **9** | **34** |

テスト質問: `data/eval/test-questions.csv`（教材 CSV の 5・6 番の列ずれを補正済み、答えあり 10 問 + 答えなし 2 問）

### 評価時の設定

| 項目 | 値 |
|---|---|
| 回答モデル | `claude-opus-5-5`（構造化出力、`fallbacks: "default"`） |
| 思考の深さ（effort） | `medium`（`RAG_CLAUDE_EFFORT` の既定値） |
| Embedding | `voyage-4` / 1024 次元 |
| 検索 | cosine 類似度しきい値 `0.3` / 上位 `5` 件（`RAG_MATCH_THRESHOLD` / `RAG_MATCH_COUNT` の既定値） |
| 応答時間の目標 | 5 秒以内 |

> 評価実行時、アプリは `CLAUDE_EFFORT` を読んでおり、Claude Code が環境に設定していた `medium` で動作していた。
> その後、変数名を `RAG_CLAUDE_EFFORT` に変更し、既定値を評価時と同じ `medium` にした（実効設定は変わらない）。

### 結果

| 指標 | 結果 |
|---|---|
| 答えがある 10 問の正答 | **10 / 10** |
| 答えがない 2 問の「該当なし」 | **2 / 2** |
| 出典ファイル名の正しさ | **10 / 10** |
| 出典ページ番号の正しさ | **10 / 10** |
| 応答時間 5 秒以内 | **12 / 12**（最小 1,830 / 中央値 2,372 / p90 2,861 / 最大 4,083 ms） |
| 未評価（429）・エラー | なし |

| 問 | 判定 | 応答時間 | 上位類似度 | 出典 |
|---|---|---|---|---|
| 1 有給休暇 | ○ | 4,083 ms | 0.620 | doc1 p.1 |
| 2 締め日・振込日 | ○ | 2,322 ms | 0.553 | doc2 p.1 |
| 3 リモートワーク日数 | ○ | 2,238 ms | 0.641 | doc4 p.1 |
| 4 パスワード | ○ | 2,595 ms | 0.669 | doc3 p.1 |
| 5 在宅勤務手当 | ○ | 2,295 ms | 0.596 | doc4 p.1 / doc2 p.1, p.2 |
| 6 接待交際費 | ○ | 1,830 ms | 0.583 | doc2 p.1 |
| 7 PC 紛失時の報告 | ○ | 2,861 ms | 0.648 | doc3 p.1 |
| 8 コアタイム | ○ | 2,372 ms | 0.676 | doc4 p.1 |
| 9 アカウント発行 | ○ | 2,445 ms | 0.618 | doc5 p.2, p.1 |
| 10 時間外労働の上限 | ○ | 2,388 ms | 0.650 | doc1 p.1 |
| 11 育児休業（答えなし） | ○ 該当なし | 2,412 ms | 0.478 | なし |
| 12 退職金（答えなし） | ○ 該当なし | 2,201 ms | 0.331 | なし |

### 採点基準（評価実行前に固定・コミット済み）

- **正答**: 期待回答から抜き出した必須要素（`data/eval/key-facts.json`）がすべて回答に含まれる。NFKC・空白・カンマ・「か月/ヶ月」の表記ゆれは正規化して照合。
- **出典**: 引用ページがすべて「出典文書 × 出典セクション」のページに含まれ、かつ必須要素が載ったページを 1 つ以上含む。
- **該当なし**: `found=false`・回答が固定文言と完全一致・出典なし。
- **応答時間**: 質問 Embedding + 検索 + Claude 回答のサーバー内処理時間（HTTP・認証の往復、429 待機は含まない）。

### 所見（未対応・精度調整は未実施）

- 答えなし 2 問も上位類似度がしきい値 0.3 を超えたため Claude が呼ばれ、Claude 側で「該当なし」と判定した。答えあり 10 問の上位類似度は 0.553〜0.676。
- 1 問目のみ検索が 1.2 秒（初回接続）。2 問目以降は 0.1〜0.2 秒。
- 問題数が少ないため、しきい値の変更はデータを増やしてから判断する。

詳細: `data/eval/results/eval-2026-11-14T12-01-15-281Z.json`

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
- 回答生成の effort はアプリ専用の `RAG_CLAUDE_EFFORT`（既定 `medium`）。`CLAUDE_EFFORT` は Claude Code が設定する名前と衝突するため読まない。
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

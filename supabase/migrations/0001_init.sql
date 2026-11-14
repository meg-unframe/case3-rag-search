-- 案件3 社内文書検索AI: 初期スキーマ
-- 適用先: 案件3専用 Supabase プロジェクト「case3-rag-search」（東京リージョン）の SQL Editor
--
-- 前提とするプロジェクト設定（作成時）:
--   - Enable Data API                  : ON
--   - Automatically expose new tables  : OFF → 新規テーブルに anon / authenticated / service_role の
--                                              select/insert/update/delete が付かない。必要な GRANT は明示する
--                                              （truncate/references/trigger/maintain は残るため明示的に剥がす）
--   - Enable automatic RLS             : ON  → 新規テーブルは自動で RLS 有効。念のため下でも明示する
--
-- アクセス方針:
--   - chunks テーブルと match_chunks 関数は service_role（= Secret key、サーバー側のみ）だけが使う
--   - anon / authenticated（ブラウザの Publishable key）からは一切アクセスさせない
--   - service_role は BYPASSRLS を持つため RLS ポリシーは不要（作らない = 他ロールは全拒否）

-- ============================================================
-- 1. 拡張
-- ============================================================
create extension if not exists vector with schema extensions;

-- ============================================================
-- 2. テーブル
-- ============================================================
-- 1 行 = 1 チャンク。チャンクはページをまたがないので page が出典ページ番号になる
create table if not exists public.chunks (
  id          bigint generated always as identity primary key,
  file_name   text    not null,                 -- 例: case3-doc1-employment-rules.pdf
  doc_title   text    not null,                 -- 例: 就業規則（抜粋）
  page        integer not null check (page >= 1),
  chunk_index integer not null check (chunk_index >= 0),
  heading     text,                             -- 所属セクション見出し
  content     text    not null,                 -- 表示・プロンプト用本文
  embedding   extensions.vector(1024) not null, -- voyage-4 既定次元（src/lib/env.ts と一致させる）
  created_at  timestamptz not null default now(),
  unique (file_name, chunk_index)
);

create index if not exists chunks_embedding_hnsw
  on public.chunks using hnsw (embedding extensions.vector_cosine_ops);

-- ============================================================
-- 3. RLS（自動 RLS が ON でも明示。ポリシーは作らない）
-- ============================================================
alter table public.chunks enable row level security;

-- ============================================================
-- 4. 権限（Automatically expose new tables = OFF 前提）
-- ============================================================
-- ブラウザ側ロールからは全権限を剥がす（OFF でも残る truncate 等を含む。TRUNCATE は RLS の対象外）
revoke all on table public.chunks from anon, authenticated;

-- サーバー側（Secret key = service_role）に必要最小限を付与
--   select: 検索・確認 / insert: 取り込み / delete: ファイル単位の入れ替え（再取り込み）
grant select, insert, delete on table public.chunks to service_role;

-- ============================================================
-- 5. 類似チャンク検索関数（supabase.rpc("match_chunks", ...) で呼ぶ）
-- ============================================================
-- 並び順は距離式そのもの（エイリアス不可: インデックスが使われなくなる）
-- search_path を空にし、型・演算子はスキーマ修飾する（search_path 乗っ取り対策）
create or replace function public.match_chunks (
  query_embedding extensions.vector(1024),
  match_threshold float,
  match_count     int
)
returns table (
  id bigint, file_name text, doc_title text, page integer,
  heading text, content text, similarity float
)
language sql stable
security invoker
set search_path = ''
as $$
  select c.id, c.file_name, c.doc_title, c.page, c.heading, c.content,
         1 - (c.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.chunks c
  where 1 - (c.embedding operator(extensions.<=>) query_embedding) > match_threshold
  order by c.embedding operator(extensions.<=>) query_embedding asc
  limit least(match_count, 20);
$$;

-- 関数の EXECUTE は「expose」設定に関係なく PUBLIC に付くため、明示的に剥がして service_role のみに付与
revoke execute on function public.match_chunks(extensions.vector, float, int) from public, anon, authenticated;
grant  execute on function public.match_chunks(extensions.vector, float, int) to service_role;

-- ============================================================
-- 6. 適用後の確認（結果を見るだけ。何も変更しない）
-- ============================================================
select
  c.relname                                                       as table_name,
  c.relrowsecurity                                                as rls_enabled,
  has_table_privilege('anon',          'public.chunks', 'select') as anon_select,
  has_table_privilege('authenticated', 'public.chunks', 'select') as authenticated_select,
  has_table_privilege('authenticated', 'public.chunks', 'truncate') as authenticated_truncate,
  has_table_privilege('service_role',  'public.chunks', 'select,insert,delete') as service_role_rw,
  has_function_privilege('anon',         'public.match_chunks(extensions.vector, float, int)', 'execute') as anon_rpc,
  has_function_privilege('authenticated','public.match_chunks(extensions.vector, float, int)', 'execute') as authenticated_rpc,
  has_function_privilege('service_role', 'public.match_chunks(extensions.vector, float, int)', 'execute') as service_role_rpc
from pg_class c
where c.oid = 'public.chunks'::regclass;
-- 期待値: rls_enabled=true, anon/authenticated の列はすべて false, service_role の列はすべて true

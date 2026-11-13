-- 案件3 社内文書検索AI: 初期スキーマ
-- 適用先: 案件3専用の Supabase プロジェクト（東京リージョン）の SQL Editor
-- ※ まだ適用していない。適用手順は README「外部サービスの設定」を参照。

create extension if not exists vector with schema extensions;

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

-- RLS: 有効化のみ（ポリシーなし）= publishable key からは読み書き不可。
-- 取り込み・検索は認可チェック済みのサーバーから secret key 経由で行う。
alter table public.chunks enable row level security;

-- 類似チャンク検索。並び順は距離式そのもの（エイリアス不可: インデックスが使われなくなる）
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
set search_path = ''
as $$
  select c.id, c.file_name, c.doc_title, c.page, c.heading, c.content,
         1 - (c.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.chunks c
  where 1 - (c.embedding operator(extensions.<=>) query_embedding) > match_threshold
  order by c.embedding operator(extensions.<=>) query_embedding asc
  limit least(match_count, 20);
$$;

-- 関数もサーバー（service_role）からのみ実行可能にする
revoke execute on function public.match_chunks(extensions.vector, float, int) from public, anon, authenticated;
grant  execute on function public.match_chunks(extensions.vector, float, int) to service_role;

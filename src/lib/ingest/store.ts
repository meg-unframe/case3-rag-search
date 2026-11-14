import type { SupabaseClient } from "@supabase/supabase-js";
import type { Chunk } from "@/lib/types";

/** public.chunks の 1 行（id / created_at は DB 側で採番） */
export type ChunkRow = {
  file_name: string;
  doc_title: string;
  page: number;
  chunk_index: number;
  heading: string | null;
  content: string;
  embedding: number[];
};

/** 保存先の抽象（テストではメモリ実装に差し替える） */
export interface ChunkStore {
  deleteByFile(fileName: string): Promise<void>;
  insert(rows: ChunkRow[]): Promise<void>;
}

export function toRows(chunks: Chunk[], embeddings: number[][]): ChunkRow[] {
  if (chunks.length !== embeddings.length) {
    throw new Error(`チャンク数(${chunks.length})と Embedding 数(${embeddings.length})が一致しません`);
  }
  return chunks.map((c, i) => ({
    file_name: c.fileName,
    doc_title: c.docTitle,
    page: c.page,
    chunk_index: c.chunkIndex,
    heading: c.heading,
    content: c.content,
    embedding: embeddings[i],
  }));
}

/** Supabase（secret key = service_role）への保存。必要な権限: select / insert / delete */
export function supabaseChunkStore(db: SupabaseClient, insertBatchSize = 100): ChunkStore {
  return {
    async deleteByFile(fileName) {
      const { error } = await db.from("chunks").delete().eq("file_name", fileName);
      if (error) throw new Error(`chunks の削除に失敗しました（${error.code ?? ""} ${error.message}）`);
    },
    async insert(rows) {
      for (let i = 0; i < rows.length; i += insertBatchSize) {
        const { error } = await db.from("chunks").insert(rows.slice(i, i + insertBatchSize));
        if (error) throw new Error(`chunks の追加に失敗しました（${error.code ?? ""} ${error.message}）`);
      }
    },
  };
}

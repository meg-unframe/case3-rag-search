// 処理時間の内訳を Server-Timing ヘッダーで返すための小さな計測器。
// ブラウザの開発者ツール（Network > Timing）や fetch の response.headers から読める。
// 返すのは区間名とミリ秒だけ（質問文・キー・資料本文は含めない）。

export type Timer = {
  /** 非同期処理を計測して結果をそのまま返す（失敗時も時間は記録する） */
  measure<T>(name: string, fn: () => Promise<T>): Promise<T>;
  /** Server-Timing ヘッダーの値。total は計測器を作ってからの経過時間 */
  header(): string;
};

const NAME = /^[a-z][a-z0-9_-]*$/;

export function createTimer(now: () => number = () => performance.now()): Timer {
  const start = now();
  const entries: { name: string; dur: number }[] = [];
  return {
    async measure(name, fn) {
      if (!NAME.test(name)) throw new Error(`invalid timing name: ${name}`);
      const t0 = now();
      try {
        return await fn();
      } finally {
        entries.push({ name, dur: now() - t0 });
      }
    },
    header() {
      return [...entries, { name: "total", dur: now() - start }]
        .map((e) => `${e.name};dur=${e.dur.toFixed(1)}`)
        .join(", ");
    },
  };
}

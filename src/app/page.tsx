import { redirect } from "next/navigation";
import { Suspense } from "react";
import { authorizeRequest } from "@/lib/auth/session";
import { signOut } from "./login/actions";
import { Chat } from "./Chat";

// cacheComponents 有効のため、リクエスト依存（認証）部分は Suspense 内で描画する
export default function Home() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-sm text-zinc-500">読み込み中…</p>}>
      <AuthorizedHome />
    </Suspense>
  );
}

async function AuthorizedHome() {
  const auth = await authorizeRequest();
  if (!auth.ok && auth.status === 401) redirect("/login");

  if (!auth.ok) {
    return (
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="max-w-md space-y-3 text-center">
          <p className="font-medium">{auth.reason}</p>
          {auth.status === 503 && (
            <p className="text-sm text-zinc-500">.env.local を設定してから開発サーバーを再起動してください。</p>
          )}
          {auth.status === 403 && (
            <form action={signOut}>
              <button className="text-sm underline">ログアウト</button>
            </form>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4">
      <header className="flex items-center justify-between border-b border-zinc-200 py-3 dark:border-zinc-800">
        <h1 className="font-semibold">社内文書検索AI</h1>
        <form action={signOut} className="flex items-center gap-3 text-sm text-zinc-500">
          <span>{auth.user.email}</span>
          <button className="underline">ログアウト</button>
        </form>
      </header>
      <Chat />
    </main>
  );
}

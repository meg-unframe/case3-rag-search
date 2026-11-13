import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16">
      <div className="text-center">
        <h1 className="text-xl font-semibold">社内文書検索AI</h1>
        <p className="mt-1 text-sm text-zinc-500">許可されたドメインのメールアドレスでログインしてください</p>
      </div>
      <LoginForm />
    </main>
  );
}

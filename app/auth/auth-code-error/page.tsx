import Link from "next/link";

export default function AuthCodeErrorPage() {
  return (
    <main className="min-h-screen bg-[#f4f7f6] px-4 py-12 text-slate-900">
      <div className="mx-auto max-w-xl rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-red-700">登入失敗</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">
          Google 登入未完成
        </h1>
        <p className="mt-3 leading-7 text-slate-600">
          請重新嘗試登入。若仍失敗，請確認 Supabase 的 Google provider、
          redirect URL 與 Google Cloud OAuth 設定是否一致。
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-9 items-center rounded-lg bg-[#1f6f78] px-3 text-sm font-medium text-white hover:bg-[#185d65]"
        >
          回到申請表
        </Link>
      </div>
    </main>
  );
}

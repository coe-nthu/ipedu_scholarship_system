import { Spinner } from "@/components/ui/spinner";

export function RouteLoading() {
  return (
    <main className="min-h-screen bg-[#f4f7f6] px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center">
        <div className="flex items-center gap-3 rounded-lg border border-[#1f6f78]/20 bg-white px-5 py-4 text-sm font-medium text-slate-700 shadow-sm">
          <Spinner className="size-5 text-[#1f6f78]" />
          <span>載入中，請稍候... / Loading, please wait...</span>
        </div>
      </div>
    </main>
  );
}

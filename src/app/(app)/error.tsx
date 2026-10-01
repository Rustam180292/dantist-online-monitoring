"use client";

import { btn, btnPrimary, card } from "@/components/ui";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className={`${card} mx-auto max-w-lg p-6 text-center`}>
      <h1 className="text-lg font-bold text-slate-900 dark:text-white">Amal bajarilmadi</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        {error.message || "Kutilmagan xatolik yuz berdi. Qaytadan urinib ko'ring."}
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <button type="button" onClick={reset} className={btnPrimary}>
          Qaytadan urinish
        </button>
        <a href="/" className={btn}>
          Bosh sahifa
        </a>
      </div>
      {error.digest ? (
        <p className="mt-4 text-xs text-slate-400">Xatolik kodi: {error.digest}</p>
      ) : null}
    </div>
  );
}

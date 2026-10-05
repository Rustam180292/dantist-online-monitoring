/**
 * Sahifa yuklanayotganda darhol ko'rinadigan "skelet".
 *
 * Ma'lumot bazadan kelguncha bir necha yuz millisekund o'tadi. Usiz shu vaqt
 * ichida ekran qotib turgandek tuyuladi va odam tugmani qayta bosaveradi.
 * Shu bilan menyu va sahifa tuzilishi darhol chiqadi, faqat ma'lumot joyi
 * bo'sh turadi.
 */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-5" aria-busy="true" aria-label="Yuklanmoqda">
      <div className="h-7 w-48 rounded-lg bg-slate-200 dark:bg-slate-800" />
      <div className="h-4 w-72 max-w-full rounded bg-slate-200 dark:bg-slate-800" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
          />
        ))}
      </div>

      <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-5 rounded bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
    </div>
  );
}

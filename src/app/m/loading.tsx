/** Telefon kabineti yuklanayotganda darhol ko'rinadigan "skelet" */
export default function Loading() {
  return (
    <div
      className="mx-auto w-full max-w-md animate-pulse space-y-4 px-4 py-5"
      aria-busy="true"
      aria-label="Yuklanmoqda"
    >
      <div className="h-6 w-44 rounded-lg bg-slate-200 dark:bg-slate-800" />
      <div className="h-4 w-56 rounded bg-slate-200 dark:bg-slate-800" />

      <div className="flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-9 flex-1 rounded-full bg-slate-200 dark:bg-slate-800" />
        ))}
      </div>

      {[0, 1, 2].map((i) => (
        <div key={i} className="app-card h-24 rounded-xl" />
      ))}
    </div>
  );
}

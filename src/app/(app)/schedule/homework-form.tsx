import { input } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { saveHomework } from "./actions";

/**
 * Seansdan keyin mutaxassis ota-onaga yozadigan izoh / uyga vazifa.
 *
 * Yig'ilgan holda turadi: har seans ostida ochiq katta maydon jadvalni
 * cho'zib yuborardi. Izoh yozilgan bo'lsa sarlavhada belgi ko'rinadi —
 * qaysi seansga yozilmay qolgani bir qarashda bilinsin.
 */
export async function HomeworkForm({
  sessionId,
  homework,
}: {
  sessionId: string;
  homework: string | null;
}) {
  const t = await getT();
  return (
    <details className="w-full" data-testid="homework">
      <summary className="cursor-pointer select-none text-xs font-medium text-indigo-600 dark:text-indigo-400">
        {homework ? `📝 ${t("Ota-onaga izoh")} ✓` : `📝 ${t("Ota-onaga izoh / uyga vazifa")}`}
      </summary>
      <form action={saveHomework} className="mt-2 space-y-2">
        <input type="hidden" name="sessionId" value={sessionId} />
        <textarea
          name="homework"
          rows={3}
          maxLength={2000}
          defaultValue={homework ?? ""}
          placeholder={t("Bugun nima qilindi, uyda nimani mashq qilish kerak…")}
          className={input}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-slate-400">
            {t("Ota-ona kabinetida ko'rinadi va Telegram'ga yuboriladi.")}
          </p>
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white"
          >
            {t("Saqlash")}
          </button>
        </div>
      </form>
    </details>
  );
}

import { Card, btn, btnPrimary, input, label } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";
import { getT } from "@/lib/i18n/server";
import { dateTimeUz } from "@/lib/format";
import { APPS_SCRIPT } from "@/lib/sheets";
import { saveSheets, syncSheetsNow } from "./actions";

/**
 * Google Sheets zaxirasi: ulash yo'riqnomasi, manzil va holat.
 *
 * Ega markaz ma'lumotini, yakka logoped faqat o'zinikini o'z jadvaliga
 * oladi. Har kuni eslatmalar cron'i bilan birga o'zi yoziladi.
 */
export async function SheetsCard({
  sheetsUrl,
  syncedAt,
  error,
  solo,
  className,
}: {
  sheetsUrl: string | null;
  syncedAt: Date | null;
  error: string | null;
  solo: boolean;
  className?: string;
}) {
  const t = await getT();
  return (
    <Card
      title={t("Google Sheets zaxira")}
      subtitle={
        solo
          ? t("ma'lumotlaringiz Google jadvalga yozib boriladi")
          : t("markaz ma'lumoti Google jadvalga yozib boriladi")
      }
      className={className}
    >
      <div className="space-y-4 p-4" data-testid="sheets">
        <details className="text-sm text-slate-600 dark:text-slate-400" open={!sheetsUrl}>
          <summary className="font-semibold text-slate-800 dark:text-slate-200">
            {t("Bir marta ulash (5 daqiqa)")}
          </summary>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5">
            <li>{t("Google Sheets'da yangi bo'sh jadval oching (sheets.new)")}</li>
            <li>{t("Kengaytmalar (Extensions) → Apps Script")}</li>
            <li>{t("U yerdagi hamma matnni o'chirib, pastdagi skriptni qo'ying va saqlang")}</li>
            <li>
              {t(
                "Deploy → New deployment → turi: Web app. \"Execute as\": Me, \"Who has access\": Anyone. Deploy ni bosing va Google so'ragan ruxsatni bering",
              )}
            </li>
            <li>{t("Chiqqan \"Web app URL\" ni (…/exec bilan tugaydi) nusxalab, pastga qo'ying")}</li>
          </ol>
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-1.5 dark:border-slate-700">
              <span className="text-xs font-medium">Apps Script</span>
              <CopyButton text={APPS_SCRIPT} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400" />
            </div>
            <pre className="max-h-64 overflow-auto p-3 text-[11px] leading-relaxed">{APPS_SCRIPT}</pre>
          </div>
          <p className="mt-2 text-xs">
            {t("Bu havolani hech kimga bermang: kimda bo'lsa, jadvalingizga yoza oladi.")}
          </p>
        </details>

        <form action={saveSheets} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label className={label} htmlFor="sheetsUrl">
              {t("Web app URL")}
            </label>
            <input
              id="sheetsUrl"
              name="sheetsUrl"
              type="url"
              defaultValue={sheetsUrl ?? ""}
              placeholder="https://script.google.com/macros/s/…/exec"
              className={input}
            />
          </div>
          <button type="submit" className={btnPrimary}>
            {t("Saqlash")}
          </button>
        </form>

        {sheetsUrl ? (
          <div className="flex flex-wrap items-center gap-3">
            <form action={syncSheetsNow}>
              <button type="submit" className={btn}>
                {t("Hozir yozish")}
              </button>
            </form>
            {error ? (
              <p className="text-sm text-rose-600 dark:text-rose-400">{t(error)}</p>
            ) : syncedAt ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t("Oxirgi marta yozildi: {when}", { when: dateTimeUz(syncedAt) })}
              </p>
            ) : null}
          </div>
        ) : null}
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t("Har o'zgarishdan keyin (bir necha soniyada) o'zi yangilanadi: varaqlar tozalanib, eng so'nggi ma'lumot yoziladi. Bundan tashqari kuniga bir marta ham yoziladi.")}
        </p>
      </div>
    </Card>
  );
}

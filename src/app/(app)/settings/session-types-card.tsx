import { Card, btn, btnPrimary, input, label } from "@/components/ui";
import { isSolo, type CurrentUser } from "@/lib/auth";
import { getSessionTypes } from "@/lib/session-types";
import { getSettings } from "@/lib/settings";
import { getT } from "@/lib/i18n/server";
import { addSessionType, removeSessionType, updateSessionType } from "./actions";

/**
 * Xizmatlar: nomi, bitta seans narxi va mutaxassis ulushi.
 *
 * Narx ham, ulush ham xizmatga bog'liq: bitta xodim ham logoped, ham massaj
 * qilsa, har biri o'z narxida va o'z foizida hisoblanadi. Mijozga xizmat
 * biriktiriladi, seans shu xizmat bilan yoziladi.
 *
 * Yakka logopedda ulush ustuni yo'q — pulning hammasi o'ziniki (100%).
 */
export async function SessionTypesCard({ user, className }: { user: CurrentUser; className?: string }) {
  const t = await getT();
  const solo = isSolo(user);
  const [types, settings] = await Promise.all([getSessionTypes(user), getSettings()]);
  // Har bir qatorda nom, narx, (ulush) va tugma — ustunlar qatorlararo tekis tursin
  const cols = solo
    ? "grid-cols-[minmax(0,1fr)_7.5rem_auto] sm:grid-cols-[minmax(0,1fr)_10rem_auto]"
    : "grid-cols-[minmax(0,1fr)_6.5rem_4.5rem_auto] sm:grid-cols-[minmax(0,1fr)_10rem_6rem_auto]";

  return (
    <Card
      title={t("Xizmatlar, narx va ulush")}
      subtitle={t("mijozga xizmat biriktiriladi — seans narxi shundan olinadi")}
      className={className}
    >
      <div className="space-y-2 p-4" data-testid="session-types">
        {types.length > 0 ? (
          <div className={`grid ${cols} gap-2 pr-8 text-xs font-medium text-slate-500 dark:text-slate-400`}>
            <span>{t("Xizmat")}</span>
            <span>{t("Narxi ({currency})", { currency: t.currency })}</span>
            {solo ? null : <span>{t("Ulush (%)")}</span>}
            <span />
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("Hali xizmat qo'shilmagan. Seans yozish uchun kamida bitta xizmat kerak.")}
          </p>
        )}

        {types.map((type) => (
          <div key={type.id} className="flex items-center gap-1" data-testid="session-type-row">
            <form action={updateSessionType} className={`grid flex-1 ${cols} items-center gap-2`}>
              <input type="hidden" name="typeId" value={type.id} />
              <input
                name="name"
                defaultValue={type.name}
                aria-label={t("Xizmat")}
                className={input}
                required
              />
              <input
                name="price"
                inputMode="numeric"
                defaultValue={type.price}
                aria-label={t("Narxi ({currency})", { currency: t.currency })}
                className={`${input} tabular-nums`}
                required
              />
              {solo ? null : (
                <input
                  name="salaryPercent"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={type.salaryPercent}
                  aria-label={t("Ulush (%)")}
                  className={`${input} tabular-nums`}
                  required
                />
              )}
              <button type="submit" className={btn}>
                {t("Saqlash")}
              </button>
            </form>
            <form action={removeSessionType}>
              <input type="hidden" name="typeId" value={type.id} />
              <button
                type="submit"
                className="rounded-lg px-2 py-2 text-sm text-slate-400 hover:text-rose-600"
                title={t("O'chirish")}
                aria-label={t("O'chirish")}
              >
                ✕
              </button>
            </form>
          </div>
        ))}

        <form
          action={addSessionType}
          className={`mt-3 grid ${cols} items-end gap-2 border-t border-slate-100 pt-4 pr-8 dark:border-slate-800`}
        >
          <div>
            <label className={label} htmlFor="newTypeName">
              {t("Yangi xizmat")}
            </label>
            <input
              id="newTypeName"
              name="name"
              placeholder={t("masalan: Logoped 45 daqiqa")}
              className={input}
              required
            />
          </div>
          <div>
            <label className={label} htmlFor="newTypePrice">
              {t("Narxi ({currency})", { currency: t.currency })}
            </label>
            <input id="newTypePrice" name="price" inputMode="numeric" className={input} required />
          </div>
          {solo ? null : (
            <div>
              <label className={label} htmlFor="newTypePercent">
                {t("Ulush (%)")}
              </label>
              <input
                id="newTypePercent"
                name="salaryPercent"
                type="number"
                min={0}
                max={100}
                defaultValue={settings.defaultSalaryPercent}
                className={input}
                required
              />
            </div>
          )}
          <button type="submit" className={btnPrimary}>
            + {t("Qo'shish")}
          </button>
        </form>
        {solo ? null : (
          <p className="pt-1 text-xs text-slate-500 dark:text-slate-400">
            {t(
              "Ulush — seans narxidan mutaxassisga tegadigan foiz. U seans \"O'tdi\" belgilangan paytda seans bilan birga saqlanadi: keyin o'zgartirsangiz, o'tgan seanslar hisobi o'zgarmaydi.",
            )}
          </p>
        )}
      </div>
    </Card>
  );
}

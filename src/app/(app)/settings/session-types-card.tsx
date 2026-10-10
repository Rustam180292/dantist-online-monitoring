import { Card, btn, btnPrimary, input, label } from "@/components/ui";
import type { CurrentUser } from "@/lib/auth";
import { getSessionTypes } from "@/lib/session-types";
import { getT } from "@/lib/i18n/server";
import { addSessionType, removeSessionType, updateSessionType } from "./actions";

/**
 * Seans turlari va narxlari: "Logoped 45 daq", "Massaj"...
 *
 * Har bir qator alohida forma — bittasini tahrirlash boshqalariga tegmaydi.
 * Jadvalga seans yozganda tur shu ro'yxatdan tanlanadi va "O'tdi"
 * belgilanganda narx turdan olinadi (abonementi bo'lsa — abonement narxidan).
 */
export async function SessionTypesCard({ user, className }: { user: CurrentUser; className?: string }) {
  const t = await getT();
  const types = await getSessionTypes(user);

  return (
    <Card
      title={t("Seans turlari va narxlari")}
      subtitle={t("jadvalga seans yozganda tur tanlanadi, narx shundan olinadi")}
      className={className}
    >
      <div className="space-y-2 p-4" data-testid="session-types">
        {types.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("Hali seans turi qo'shilmagan — hozircha standart narx ishlatiladi.")}
          </p>
        ) : (
          types.map((type) => (
            <div key={type.id} className="flex items-center gap-1" data-testid="session-type-row">
              {/* Nom, narx va tugma bitta qatorda — ro'yxat jadvaldek o'qilsin */}
              <form
                action={updateSessionType}
                className="grid flex-1 grid-cols-[minmax(0,1fr)_7.5rem_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto]"
              >
                <input type="hidden" name="typeId" value={type.id} />
                <input
                  name="name"
                  defaultValue={type.name}
                  aria-label={t("Seans turi")}
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
          ))
        )}

        <form
          action={addSessionType}
          className="mt-3 grid grid-cols-[minmax(0,1fr)_7.5rem] items-end gap-2 border-t border-slate-100 pt-4 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:pr-8 dark:border-slate-800"
        >
          <div>
            <label className={label} htmlFor="newTypeName">
              {t("Yangi seans turi")}
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
          <button type="submit" className={`${btnPrimary} col-span-2 sm:col-span-1`}>
            + {t("Qo'shish")}
          </button>
        </form>
      </div>
    </Card>
  );
}

import { Card, btnPrimary, input, label } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { WEEKDAYS, minutesToTime, type WorkHours } from "@/lib/settings";
import { updateWorkHours } from "./actions";

/**
 * Ish kunlari, ish vaqti va tushlik.
 *
 * Ega markaz ish vaqtini, yakka logoped o'zinikini saqlaydi — forma bitta,
 * server kimligiga qarab qayerga yozishni o'zi tanlaydi. "Bo'sh vaqtlar"
 * shu jadval bo'yicha hisoblanadi, tushlik vaqti taklif qilinmaydi.
 */
export async function WorkHoursCard({ hours, className }: { hours: WorkHours; className?: string }) {
  const t = await getT();
  return (
    <Card
      title={t("Ish vaqti")}
      subtitle={t("ish kunlari, ish vaqti va tushlik — bo'sh vaqtlar shu bo'yicha hisoblanadi")}
      className={className}
    >
      <form action={updateWorkHours} className="grid gap-3 p-4 sm:grid-cols-3" data-testid="work-hours">
        <div className="sm:col-span-3">
          <p className={label}>{t("Ish kunlari")}</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => (
              <label
                key={d.value}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700"
              >
                <input
                  type="checkbox"
                  name="workDays"
                  value={d.value}
                  defaultChecked={hours.workDays.includes(d.value)}
                />
                {t.isoWeekday(d.value)}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className={label} htmlFor="workStartHour">
            {t("Ish boshlanishi (soat)")}
          </label>
          <input
            id="workStartHour"
            name="workStartHour"
            type="number"
            min={0}
            max={23}
            defaultValue={hours.workStartHour}
            className={input}
          />
        </div>
        <div>
          <label className={label} htmlFor="workEndHour">
            {t("Ish tugashi (soat)")}
          </label>
          <input
            id="workEndHour"
            name="workEndHour"
            type="number"
            min={1}
            max={24}
            defaultValue={hours.workEndHour}
            className={input}
          />
        </div>
        <div>
          <label className={label} htmlFor="slotMinutes">
            {t("Vaqt oralig'i (daqiqa)")}
          </label>
          <input
            id="slotMinutes"
            name="slotMinutes"
            type="number"
            min={15}
            max={240}
            step={5}
            defaultValue={hours.slotMinutes}
            className={input}
          />
        </div>

        <div>
          <label className={label} htmlFor="lunchStart">
            {t("Tushlik boshlanishi")}
          </label>
          <input
            id="lunchStart"
            name="lunchStart"
            type="time"
            defaultValue={minutesToTime(hours.lunchStartMin)}
            className={input}
          />
        </div>
        <div>
          <label className={label} htmlFor="lunchEnd">
            {t("Tushlik tugashi")}
          </label>
          <input
            id="lunchEnd"
            name="lunchEnd"
            type="time"
            defaultValue={minutesToTime(hours.lunchEndMin)}
            className={input}
          />
        </div>
        <p className="self-end pb-2 text-xs text-slate-500 dark:text-slate-400">
          {t("Tushliksiz ishlasangiz — ikkalasini bo'sh qoldiring.")}
        </p>

        <div className="sm:col-span-3">
          <button type="submit" className={btnPrimary}>
            {t("Saqlash")}
          </button>
        </div>
      </form>
    </Card>
  );
}

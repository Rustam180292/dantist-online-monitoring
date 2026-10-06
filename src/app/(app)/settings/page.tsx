import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/telegram";
import { getSettings, WEEKDAYS } from "@/lib/settings";
import { Card, PageHeader, btnPrimary, input, label } from "@/components/ui";
import {
  backupNow,
  changePassword,
  updateCenter,
  updatePricing,
  updateWorkHours,
} from "./actions";

export default async function SettingsPage() {
  const user = await requireUser();
  const s = await getSettings();
  const isOwner = user.role === "OWNER";

  // Zaxira Telegram orqali ketadi — ega botga ulanmagan bo'lsa ogohlantiramiz
  const me = isOwner
    ? await prisma.user.findUnique({ where: { id: user.id }, select: { telegramId: true } })
    : null;
  const telegramLinked = Boolean(me?.telegramId);
  const backupUrl = `${appUrl()}/api/backup?secret=<CRON_SECRET>`;

  return (
    <>
      <PageHeader
        title="Sozlamalar"
        subtitle={isOwner ? "markaz sozlamalari va shaxsiy parol" : "shaxsiy parol"}
      />

      {isOwner ? (
        <>
          <Card title="Markaz" subtitle="nomi hisobotlarda va hujjatlarda ishlatiladi">
            <form action={updateCenter} className="grid gap-3 p-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="centerName">
                  Markaz nomi *
                </label>
                <input
                  id="centerName"
                  name="centerName"
                  defaultValue={s.centerName}
                  className={input}
                  required
                />
              </div>
              <div>
                <label className={label} htmlFor="centerPhone">
                  Markaz telefoni
                </label>
                <input
                  id="centerPhone"
                  name="centerPhone"
                  type="tel"
                  defaultValue={s.centerPhone ?? ""}
                  className={input}
                />
              </div>
              <div className="sm:col-span-2">
                <button type="submit" className={btnPrimary}>
                  Saqlash
                </button>
              </div>
            </form>
          </Card>

          <Card
            title="Narx va ulush"
            subtitle="yangi abonement va yangi mutaxassis uchun standart qiymatlar"
            className="mt-5"
          >
            <form action={updatePricing} className="grid gap-3 p-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="defaultPrice">
                  Bitta seans narxi (so&apos;m)
                </label>
                <input
                  id="defaultPrice"
                  name="defaultPrice"
                  inputMode="numeric"
                  defaultValue={s.defaultPrice}
                  className={input}
                />
              </div>
              <div>
                <label className={label} htmlFor="defaultSalaryPercent">
                  Yangi mutaxassis uchun ulush (%)
                </label>
                <input
                  id="defaultSalaryPercent"
                  name="defaultSalaryPercent"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={s.defaultSalaryPercent}
                  className={input}
                />
              </div>
              <p className="text-xs text-slate-500 sm:col-span-2 dark:text-slate-400">
                Bu qiymatlar formalarda oldindan to&apos;ldirilgan bo&apos;lib turadi.
                Mavjud mutaxassislarning foizi o&apos;zgarmaydi — u Xodimlar bo&apos;limida
                alohida turadi.
              </p>
              <div className="sm:col-span-2">
                <button type="submit" className={btnPrimary}>
                  Saqlash
                </button>
              </div>
            </form>
          </Card>

          <Card
            title="Ish vaqti"
            subtitle="bo'sh vaqtlar shu jadval bo'yicha hisoblanadi"
            className="mt-5"
          >
            <form action={updateWorkHours} className="grid gap-3 p-4 sm:grid-cols-3">
              <div>
                <label className={label} htmlFor="workStartHour">
                  Ish boshlanishi (soat)
                </label>
                <input
                  id="workStartHour"
                  name="workStartHour"
                  type="number"
                  min={0}
                  max={23}
                  defaultValue={s.workStartHour}
                  className={input}
                />
              </div>
              <div>
                <label className={label} htmlFor="workEndHour">
                  Ish tugashi (soat)
                </label>
                <input
                  id="workEndHour"
                  name="workEndHour"
                  type="number"
                  min={1}
                  max={24}
                  defaultValue={s.workEndHour}
                  className={input}
                />
              </div>
              <div>
                <label className={label} htmlFor="slotMinutes">
                  Vaqt oralig&apos;i (daqiqa)
                </label>
                <input
                  id="slotMinutes"
                  name="slotMinutes"
                  type="number"
                  min={15}
                  max={240}
                  step={5}
                  defaultValue={s.slotMinutes}
                  className={input}
                />
              </div>

              <div className="sm:col-span-3">
                <p className={label}>Ish kunlari</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {WEEKDAYS.map((d) => (
                    <label
                      key={d.value}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700"
                    >
                      <input
                        type="checkbox"
                        name="workDays"
                        value={d.value}
                        defaultChecked={s.workDays.includes(d.value)}
                      />
                      {d.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="sm:col-span-3">
                <button type="submit" className={btnPrimary}>
                  Saqlash
                </button>
              </div>
            </form>
          </Card>

          <Card
            title="Zaxira nusxa"
            subtitle="baza Telegram orqali sizga yuboriladi"
            className="mt-5"
          >
            <div className="space-y-3 p-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Zaxira — bazaning to&apos;liq nusxasi: mijozlar, seanslar, to&apos;lovlar,
                qabullar, xodimlar. Fayl Telegram&apos;dagi suhbatingizga keladi, uni
                saqlab qo&apos;yasiz. <b>Parollar bu nusxaga kiritilmaydi.</b>
              </p>

              <form action={backupNow}>
                <button type="submit" className={btnPrimary}>
                  Hozir zaxiralash
                </button>
              </form>

              {telegramLinked ? null : (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  Siz Telegram botga ulanmagansiz — zaxira yuborilmaydi. Botga{" "}
                  <code className="font-mono">/start</code> yozib, raqamingizni ulashing.
                </p>
              )}

              <details className="text-sm text-slate-600 dark:text-slate-400">
                <summary className="cursor-pointer font-semibold text-slate-800 dark:text-slate-200">
                  Har kuni avtomatik bo&apos;lishi uchun (bir martalik sozlash)
                </summary>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  <li>
                    <code className="font-mono">cron-job.org</code> da yangi vazifa
                    oching (eslatmalar uchun ochganingiz kabi)
                  </li>
                  <li>
                    Manzil: <code className="font-mono break-all">{backupUrl}</code>
                  </li>
                  <li>Vaqti: kuniga bir marta, masalan 22:00</li>
                </ol>
                <p className="mt-2">
                  Shundan keyin har kecha zaxira o&apos;zi keladi.
                </p>
              </details>
            </div>
          </Card>
        </>
      ) : null}

      <Card
        title="Parolni o'zgartirish"
        subtitle="o'z parolingizni o'zingiz almashtirasiz"
        className={isOwner ? "mt-5" : ""}
      >
        <form action={changePassword} className="grid gap-3 p-4 sm:grid-cols-3">
          <div>
            <label className={label} htmlFor="currentPassword">
              Joriy parol *
            </label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              className={input}
              required
            />
          </div>
          <div>
            <label className={label} htmlFor="newPassword">
              Yangi parol (kamida 5 belgi) *
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              className={input}
              required
            />
          </div>
          <div>
            <label className={label} htmlFor="repeatPassword">
              Yangi parolni takrorlang *
            </label>
            <input
              id="repeatPassword"
              name="repeatPassword"
              type="password"
              className={input}
              required
            />
          </div>
          <div className="sm:col-span-3">
            <button type="submit" className={btnPrimary}>
              Parolni o&apos;zgartirish
            </button>
          </div>
        </form>
      </Card>
    </>
  );
}

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/telegram";
import { getSettings, WEEKDAYS } from "@/lib/settings";
import { getT } from "@/lib/i18n/server";
import { Card, PageHeader, btn, btnDanger, btnPrimary, input, label } from "@/components/ui";
import { BrandMark } from "@/components/brand";
import { LanguageSwitcher, ThemeToggle } from "@/components/prefs";
import {
  backupNow,
  changePassword,
  removeLogo,
  updateCenter,
  updatePricing,
  updateWorkHours,
  uploadLogo,
} from "./actions";

export default async function SettingsPage() {
  const user = await requireUser();
  const s = await getSettings();
  const t = await getT();
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
        title={t("Sozlamalar")}
        subtitle={isOwner ? t("markaz sozlamalari va shaxsiy parol") : t("shaxsiy parol")}
      />

      {/* Ko'rinish va til — har bir foydalanuvchi o'zi uchun tanlaydi */}
      <Card title={t("Ko'rinish va til")} subtitle={t("shu qurilmada saqlanadi")} className="mb-5">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4 p-4">
          <div>
            <p className={label}>{t("Rejim")}</p>
            <ThemeToggle className={btn} />
          </div>
          <div>
            <p className={label}>{t("Til")}</p>
            <LanguageSwitcher className="rounded-lg border border-slate-200 p-1 dark:border-slate-700" />
          </div>
        </div>
      </Card>

      {isOwner ? (
        <>
          <Card title={t("Markaz")} subtitle={t("nomi hisobotlarda va hujjatlarda ishlatiladi")}>
            <form action={updateCenter} className="grid gap-3 p-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="centerName">
                  {t("Markaz nomi")} *
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
                  {t("Markaz telefoni")}
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
                  {t("Saqlash")}
                </button>
              </div>
            </form>
          </Card>

          <Card
            title={t("Logotip")}
            subtitle={t("menyuda va kirish sahifasida ko'rinadi")}
            className="mt-5"
          >
            <div className="flex flex-wrap items-start gap-4 p-4">
              <BrandMark logoUrl={s.logoUrl} size="lg" />
              <div className="min-w-0 flex-1 space-y-3">
                <form action={uploadLogo} className="flex flex-wrap items-center gap-2">
                  <input
                    id="logo"
                    name="logo"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    required
                    className="block w-full max-w-xs text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 dark:text-slate-400 dark:file:bg-indigo-950 dark:file:text-indigo-300"
                  />
                  <button type="submit" className={btnPrimary}>
                    {t("Yuklash")}
                  </button>
                </form>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t("PNG, JPG yoki WEBP, 500 KB gacha. Kvadrat rasm yaxshi ko'rinadi.")}
                </p>
                {s.logoUrl ? (
                  <form action={removeLogo}>
                    <button type="submit" className={btnDanger}>
                      {t("Logotipni olib tashlash")}
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          </Card>

          <Card
            title={t("Narx va ulush")}
            subtitle={t("yangi abonement va yangi mutaxassis uchun standart qiymatlar")}
            className="mt-5"
          >
            <form action={updatePricing} className="grid gap-3 p-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="defaultPrice">
                  {t("Bitta seans narxi ({currency})", { currency: t.currency })}
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
                  {t("Yangi mutaxassis uchun ulush (%)")}
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
                {t(
                  "Bu qiymatlar formalarda oldindan to'ldirilgan bo'lib turadi. Mavjud mutaxassislarning foizi o'zgarmaydi — u Xodimlar bo'limida alohida turadi.",
                )}
              </p>
              <div className="sm:col-span-2">
                <button type="submit" className={btnPrimary}>
                  {t("Saqlash")}
                </button>
              </div>
            </form>
          </Card>

          <Card
            title={t("Ish vaqti")}
            subtitle={t("bo'sh vaqtlar shu jadval bo'yicha hisoblanadi")}
            className="mt-5"
          >
            <form action={updateWorkHours} className="grid gap-3 p-4 sm:grid-cols-3">
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
                  defaultValue={s.workStartHour}
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
                  defaultValue={s.workEndHour}
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
                  defaultValue={s.slotMinutes}
                  className={input}
                />
              </div>

              <div className="sm:col-span-3">
                <p className={label}>{t("Ish kunlari")}</p>
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
                      {t.isoWeekday(d.value)}
                    </label>
                  ))}
                </div>
              </div>

              <div className="sm:col-span-3">
                <button type="submit" className={btnPrimary}>
                  {t("Saqlash")}
                </button>
              </div>
            </form>
          </Card>

          <Card
            title={t("Zaxira nusxa")}
            subtitle={t("baza Telegram orqali sizga yuboriladi")}
            className="mt-5"
          >
            <div className="space-y-3 p-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t(
                  "Zaxira — bazaning to'liq nusxasi: mijozlar, seanslar, to'lovlar, qabullar, xodimlar. Fayl Telegram'dagi suhbatingizga keladi, uni saqlab qo'yasiz.",
                )}{" "}
                <b>{t("Parollar bu nusxaga kiritilmaydi.")}</b>
              </p>

              <form action={backupNow}>
                <button type="submit" className={btnPrimary}>
                  {t("Hozir zaxiralash")}
                </button>
              </form>

              {telegramLinked ? null : (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  {t("Siz Telegram botga ulanmagansiz — zaxira yuborilmaydi. Botga /start yozib, raqamingizni ulashing.")}
                </p>
              )}

              <details className="text-sm text-slate-600 dark:text-slate-400">
                <summary className="cursor-pointer font-semibold text-slate-800 dark:text-slate-200">
                  {t("Har kuni avtomatik bo'lishi uchun (bir martalik sozlash)")}
                </summary>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  <li>
                    {t("cron-job.org da yangi vazifa oching (eslatmalar uchun ochganingiz kabi)")}
                  </li>
                  <li>
                    {t("Manzil:")} <code className="font-mono break-all">{backupUrl}</code>
                  </li>
                  <li>{t("Vaqti: kuniga bir marta, masalan 22:00")}</li>
                </ol>
                <p className="mt-2">{t("Shundan keyin har kecha zaxira o'zi keladi.")}</p>
              </details>
            </div>
          </Card>
        </>
      ) : null}

      <Card
        title={t("Parolni o'zgartirish")}
        subtitle={t("o'z parolingizni o'zingiz almashtirasiz")}
        className={isOwner ? "mt-5" : ""}
      >
        <form action={changePassword} className="grid gap-3 p-4 sm:grid-cols-3">
          <div>
            <label className={label} htmlFor="currentPassword">
              {t("Joriy parol")} *
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
              {t("Yangi parol (kamida 5 belgi)")} *
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
              {t("Yangi parolni takrorlang")} *
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
              {t("Parolni o'zgartirish")}
            </button>
          </div>
        </form>
      </Card>
    </>
  );
}

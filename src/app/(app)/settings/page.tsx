import { PasswordInput } from "@/components/password-input";
import { isSolo, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/telegram";
import { getSettings, getWorkHours } from "@/lib/settings";
import { getT } from "@/lib/i18n/server";
import { Card, PageHeader, btn, btnDanger, btnPrimary, input, label } from "@/components/ui";
import { BrandMark } from "@/components/brand";
import { LogoInput } from "@/components/logo-upload";
import { SessionTypesCard } from "./session-types-card";
import { WorkHoursCard } from "./work-hours-card";
import { SheetsCard } from "./sheets-card";
import { LanguageSwitcher, ThemeToggle } from "@/components/prefs";
import {
  backupNow,
  changePassword,
  postChannel,
  removeLogo,
  updateBrand,
  updateCenter,
  updateProfile,
  uploadLogo,
} from "./actions";

export default async function SettingsPage() {
  const user = await requireUser();
  const isOwner = user.role === "OWNER";
  const solo = isSolo(user);
  // Hammasi bitta to'lqinda — baza uzoqda, ketma-ket so'rov sahifani sekinlashtiradi
  const [s, t, hours, me, soloSheets] = await Promise.all([
    getSettings(),
    getT(),
    // Yakka logopedga o'z ish vaqti, egaga markazniki; boshqalarga kerak emas
    isOwner || solo ? getWorkHours(solo ? user.branchId : null) : Promise.resolve(null),
    // Zaxira Telegram orqali ketadi — ega botga ulanmagan bo'lsa ogohlantiramiz
    isOwner
      ? prisma.user.findUnique({ where: { id: user.id }, select: { telegramId: true } })
      : Promise.resolve(null),
    // Yakka logopedning o'z Google jadvali (markaznikidan alohida)
    solo && user.branchId
      ? prisma.branch.findUnique({
          where: { id: user.branchId },
          select: { sheetsUrl: true, sheetsSyncedAt: true, sheetsError: true },
        })
      : Promise.resolve(null),
  ]);
  const telegramLinked = Boolean(me?.telegramId);
  const backupUrl = `${appUrl()}/api/backup?secret=<CRON_SECRET>`;
  // Yakka logopedning o'z logotipi; qo'yilmagan bo'lsa markaznikini ko'radi
  const soloLogoUrl =
    solo && user.brandLogoAt && user.branchId
      ? `/api/logo?b=${user.branchId}&v=${new Date(user.brandLogoAt).getTime()}`
      : null;
  const fileInput =
    "block w-full max-w-xs text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 dark:text-slate-400 dark:file:bg-indigo-950 dark:file:text-indigo-300";

  return (
    <>
      <PageHeader
        title={t("Sozlamalar")}
        subtitle={
          isOwner
            ? t("markaz sozlamalari va shaxsiy parol")
            : solo
              ? t("ma'lumotlaringiz, ilova nomi, xizmatlar va parol")
              : t("shaxsiy parol")
        }
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

      {solo ? (
        <>
          <Card
            title={t("Mening ma'lumotlarim")}
            subtitle={t("ism-familiya va telefon — telefon bilan tizimga kirasiz")}
            className="mb-5"
          >
            <form action={updateProfile} className="grid gap-3 p-4 sm:grid-cols-3" data-testid="solo-profile">
              <div>
                <label className={label} htmlFor="profileName">
                  {t("Ism familiya")} *
                </label>
                <input
                  id="profileName"
                  name="fullName"
                  defaultValue={user.fullName}
                  maxLength={80}
                  className={input}
                  required
                />
              </div>
              <div>
                <label className={label} htmlFor="profilePhone">
                  {t("Telefon")} *
                </label>
                <input
                  id="profilePhone"
                  name="phone"
                  type="tel"
                  defaultValue={user.phone}
                  className={input}
                  required
                />
              </div>
              <div>
                <label className={label} htmlFor="profilePassword">
                  {t("Joriy parol")}
                </label>
                <PasswordInput id="profilePassword" name="currentPassword" autoComplete="current-password" />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t("faqat telefonni o'zgartirsangiz kerak")}
                </p>
              </div>
              <div className="sm:col-span-3">
                <button type="submit" className={btnPrimary}>
                  {t("Saqlash")}
                </button>
              </div>
            </form>
          </Card>

          <Card
            title={t("Ilova nomi va logotip")}
            subtitle={t("menyu tepasida ko'rinadi")}
            className="mb-5"
          >
            <div className="space-y-5 p-4">
              <form action={updateBrand} className="flex flex-wrap items-end gap-3" data-testid="solo-brand">
                <div className="min-w-[220px] flex-1">
                  <label className={label} htmlFor="brandName">
                    {t("Ilova nomi")}
                  </label>
                  <input
                    id="brandName"
                    name="brandName"
                    defaultValue={user.brandName ?? ""}
                    placeholder="Logoped CRM"
                    maxLength={40}
                    className={input}
                  />
                </div>
                <button type="submit" className={btnPrimary}>
                  {t("Saqlash")}
                </button>
              </form>
              <p className="-mt-3 text-xs text-slate-500 dark:text-slate-400">
                {t("Bo'sh qoldirsangiz \"Logoped CRM\" ko'rinadi.")}
              </p>

              <div className="flex flex-wrap items-start gap-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                <BrandMark logoUrl={soloLogoUrl ?? s.logoUrl} size="lg" />
                <div className="min-w-0 flex-1 space-y-3">
                  <form action={uploadLogo}>
                    <LogoInput inputClassName={fileInput} />
                  </form>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("PNG, JPG yoki WEBP. Katta rasm o'zi kichraytiriladi. Kvadrat rasm yaxshi ko'rinadi.")}
                  </p>
                  {soloLogoUrl ? (
                    <form action={removeLogo}>
                      <button type="submit" className={btnDanger}>
                        {t("Logotipni olib tashlash")}
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            </div>
          </Card>

          <SessionTypesCard user={user} className="mb-5" />

          {hours ? <WorkHoursCard hours={hours} className="mb-5" /> : null}

          {soloSheets ? (
            <SheetsCard
              sheetsUrl={soloSheets.sheetsUrl}
              syncedAt={soloSheets.sheetsSyncedAt}
              error={soloSheets.sheetsError}
              solo
              className="mb-5"
            />
          ) : null}
        </>
      ) : null}

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
                <form action={uploadLogo}>
                  <LogoInput inputClassName={fileInput} />
                </form>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t("PNG, JPG yoki WEBP. Katta rasm o'zi kichraytiriladi. Kvadrat rasm yaxshi ko'rinadi.")}
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

          <SessionTypesCard user={user} className="mt-5" />

          {hours ? <WorkHoursCard hours={hours} className="mt-5" /> : null}

          <SheetsCard
            sheetsUrl={s.sheetsUrl}
            syncedAt={s.sheetsSyncedAt}
            error={s.sheetsError}
            solo={false}
            className="mt-5"
          />

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

      {isOwner || isSolo(user) ? (
        <Card
          title={t("Telegram kanalga e'lon")}
          subtitle={t("ota-onalar kanaliga \"Kabinetni ochish\" tugmali post")}
          className="mt-5"
        >
          <div className="space-y-3 p-4">
            <details className="text-sm text-slate-600 dark:text-slate-400">
              <summary className="cursor-pointer font-semibold text-slate-800 dark:text-slate-200">
                {t("Avval bir marta: botni kanalga admin qiling")}
              </summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>{t("Telegram'da kanalingizni oching → kanal nomini bosing")}</li>
                <li>{t("Administratorlar → Admin qo'shish → markaz botining nomini qidiring")}</li>
                <li>{t("\"Xabar joylash\" va \"Xabarlarni qadash\" huquqlarini yoqib, saqlang")}</li>
              </ol>
            </details>

            <form action={postChannel} className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="channel">
                  {t("Kanal")} *
                </label>
                <input
                  id="channel"
                  name="channel"
                  placeholder="@markaz_kanali"
                  className={input}
                  required
                />
                <p className="mt-1 text-xs text-slate-400">
                  {t("Ochiq kanal — @nomi, yopiq kanal — -100 bilan boshlanadigan raqami")}
                </p>
              </div>
              <div>
                <label className={label} htmlFor="buttonText">
                  {t("Tugma matni")}
                </label>
                <input
                  id="buttonText"
                  name="buttonText"
                  defaultValue={t("📱 Kabinetni ochish")}
                  maxLength={60}
                  className={input}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={label} htmlFor="channelText">
                  {t("E'lon matni")} *
                </label>
                <textarea
                  id="channelText"
                  name="text"
                  rows={11}
                  maxLength={4000}
                  required
                  className={input}
                  defaultValue={t(
                    "📱 Farzandingiz kabineti endi Telegram'da!\n\nJadval, davomat, to'lovlar va mutaxassislar bilan aloqa — hammasi bir joyda.\n\nQanday ochiladi:\n1. Pastdagi tugmani bosing\n2. Botda \"Start\" ni bosing\n3. \"📱 Raqamimni yuborish\" ni bosing — markazga bergan raqamingiz bo'lishi kerak\n4. \"Kabinetni ochish\" tugmasi chiqadi — tayyor!",
                  )}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input type="checkbox" name="pin" defaultChecked className="h-4 w-4" />
                {t("Kanalda qadab qo'yish (pin)")}
              </label>
              <div className="sm:text-right">
                <button type="submit" className={btnPrimary}>
                  {t("Kanalga joylash")}
                </button>
              </div>
            </form>
          </div>
        </Card>
      ) : null}

      <Card
        title={t("Parolni o'zgartirish")}
        subtitle={t("o'z parolingizni o'zingiz almashtirasiz")}
        className={isOwner || isSolo(user) ? "mt-5" : ""}
      >
        <form action={changePassword} className="grid gap-3 p-4 sm:grid-cols-3">
          <div>
            <label className={label} htmlFor="currentPassword">
              {t("Joriy parol")} *
            </label>
            <PasswordInput id="currentPassword" name="currentPassword" autoComplete="current-password" required />
          </div>
          <div>
            <label className={label} htmlFor="newPassword">
              {t("Yangi parol (kamida 5 belgi)")} *
            </label>
            <PasswordInput id="newPassword" name="newPassword" autoComplete="new-password" required />
          </div>
          <div>
            <label className={label} htmlFor="repeatPassword">
              {t("Yangi parolni takrorlang")} *
            </label>
            <PasswordInput id="repeatPassword" name="repeatPassword" autoComplete="new-password" required />
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

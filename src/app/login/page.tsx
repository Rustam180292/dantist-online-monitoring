import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { btnPrimary, card, input, label } from "@/components/ui";
import { BrandMark } from "@/components/brand";
import { I18nProvider } from "@/components/i18n";
import { LanguageSwitcher, ThemeToggle } from "@/components/prefs";
import { getSettings } from "@/lib/settings";
import { dictFor } from "@/lib/i18n/dicts";
import { getT } from "@/lib/i18n/server";
import { login } from "./actions";

const ERRORS: Record<string, string> = {
  bosh: "Telefon raqam va parolni kiriting.",
  notogri: "Telefon raqam yoki parol noto'g'ri.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) {
    redirect(
      user.role === "SPECIALIST" || user.role === "PARENT"
        ? "/m"
        : user.role === "RECEPTION"
          ? "/schedule"
          : "/",
    );
  }

  const { error } = await searchParams;
  const t = await getT();
  const { logoUrl } = await getSettings();
  const message = error ? t(ERRORS[error] ?? "Kirishda xatolik.") : null;

  /**
   * Demo hisoblar ro'yxati — faqat sinov muhitida.
   *
   * Sayt internetda ochiq turadi: bu ro'yxat ko'rinib tursa, istalgan odam
   * markaz egasi sifatida kirib, mijozlar, to'lovlar va maoshlarni ko'ra oladi.
   * Shuning uchun u lokalda o'zi ko'rinadi, serverda esa faqat `DEMO_LOGINS=1`
   * qo'yilgan bo'lsa. Haqiqiy markaz ishga tushganda bu o'zgaruvchini olib
   * tashlang (va demo hisoblarning o'zini ham bazadan o'chiring).
   */
  const showDemo = process.env.NODE_ENV !== "production" || process.env.DEMO_LOGINS === "1";

  return (
    <I18nProvider locale={t.locale} dict={dictFor(t.locale)}>
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        {/* Til va mavzu kirishdan oldin ham tanlansin: xodim o'zbekcha bilmasligi mumkin */}
        <div className="mb-6 flex items-center justify-between">
          <LanguageSwitcher />
          <ThemeToggle className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800" />
        </div>
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex w-fit">
            <BrandMark logoUrl={logoUrl} size="lg" />
          </div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            {t("Logopedik markaz CRM")}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("Tizimga kirish uchun ma'lumotlaringizni kiriting")}
          </p>
        </div>

        <form action={login} className={`${card} space-y-4 p-5`}>
          {message ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
              {message}
            </p>
          ) : null}

          <div>
            <label className={label} htmlFor="phone">
              {t("Telefon raqam")}
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="username"
              placeholder="+998901234567"
              className={input}
              required
            />
          </div>

          <div>
            <label className={label} htmlFor="password">
              {t("Parol")}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              className={input}
              required
            />
          </div>

          <button type="submit" className={`${btnPrimary} w-full`}>
            {t("Kirish")}
          </button>
        </form>

        {showDemo ? (
        <div className={`${card} mt-4 p-4 text-xs leading-relaxed text-slate-600 dark:text-slate-400`}>
          <p className="mb-2 font-semibold text-slate-700 dark:text-slate-300">
            {t("Demo kirish")} ({t("parol")}: <code className="font-mono">parol123</code>)
          </p>
          <ul className="space-y-1">
            <li>
              {t("Markaz egasi")} — <code className="font-mono">+998901234567</code>
            </li>
            <li>
              {t("Filial admini")} — <code className="font-mono">+998901110011</code>
            </li>
            <li>
              {t("Qabulxona xodimi")} — <code className="font-mono">+998901110012</code>
            </li>
            <li>
              {t("Mutaxassis")} — <code className="font-mono">+998901110101</code>
            </li>
            <li className="pt-1 text-slate-500 dark:text-slate-500">
              {t("Ota-ona")} — {t("mijoz kartasidagi telefon raqami")}
            </li>
          </ul>
          <p className="mt-2 text-slate-500 dark:text-slate-500">
            {t("Har bir rol boshqa ekranni ko'radi. Kirgandan keyin chap menyuning pastida qaysi rol ekani yozib turadi.")}
          </p>
        </div>
        ) : null}
      </div>
    </main>
    </I18nProvider>
  );
}

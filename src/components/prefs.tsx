"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { LOCALES, LOCALE_COOKIE, LOCALE_NAMES, type Locale } from "@/lib/i18n";
import { useT } from "@/components/i18n";

export const THEME_COOKIE = "theme";
const YEAR = 60 * 60 * 24 * 365;

/** Brauzer satrining rangi — root layout'dagi skript ham shu qiymatlarni qo'yadi */
export const THEME_COLOR = { light: "#effbf6", dark: "#020617" } as const;

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${YEAR}; SameSite=Lax`;
}

/**
 * Rejim bir nechta joyda almashtiriladi (menyu va Sozlamalar sahifasi), lekin
 * u butun sahifaga tegishli bitta holat. Har bir tugma o'zinikini saqlasa,
 * birini bosganda ikkinchisi eski belgisi bilan qolib ketardi — shuning uchun
 * o'zgarish hammasiga xabar qilinadi.
 */
const watchers = new Set<(dark: boolean) => void>();

function applyTheme(dark: boolean) {
  const d = document.documentElement;
  d.classList.toggle("dark", dark);
  d.style.colorScheme = dark ? "dark" : "light";
  // Telefonda brauzer/ilova satrining rangi ham tanlovga ergashsin
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? THEME_COLOR.dark : THEME_COLOR.light);
  setCookie(THEME_COOKIE, dark ? "dark" : "light");
  for (const w of watchers) w(dark);
}

/**
 * Tun va kun rejimi.
 *
 * Tanlov cookie'da turadi va `<html>` ga `dark` klassi qo'yiladi; sahifa
 * ochilishidan oldin uni root layout'dagi kichik skript qo'yadi (yo'qsa
 * sahifa bir lahza boshqa rangda chaqnab ketadi). Hali tanlanmagan bo'lsa,
 * telefon/kompyuter mavzusiga ergashadi — avvalgi xatti-harakat saqlanadi.
 */
export function ThemeToggle({
  className = "",
  iconOnly = false,
}: {
  className?: string;
  /** Tepa panelda faqat belgi: joy tejaladi, nomi esa sichqoncha ustida chiqadi */
  iconOnly?: boolean;
}) {
  const t = useT();
  // Server qaysi rejim tanlanganini bilmaydi; to'g'ri belgini brauzerda
  // qo'yamiz, shungacha tugma ikkala holatda ham bir xil ko'rinadi.
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    watchers.add(setDark);
    return () => {
      watchers.delete(setDark);
    };
  }, []);

  function toggle() {
    applyTheme(!document.documentElement.classList.contains("dark"));
  }

  const label = dark ? t("Kunduzgi rejim") : t("Tungi rejim");
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      data-testid="theme-toggle"
      className={className}
    >
      {dark ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path strokeLinecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z" />
        </svg>
      )}
      <span className={iconOnly ? "sr-only" : "sr-only sm:not-sr-only"}>
        {dark === null ? t("Mavzu") : label}
      </span>
    </button>
  );
}

/** Til tanlash: cookie yoziladi va sahifa serverdan yangi tilda qayta chiziladi */
export function LanguageSwitcher({
  className = "",
  variant = "plain",
}: {
  className?: string;
  /** "pill" — tepa paneldagi yaxlit almashtirgich */
  variant?: "plain" | "pill";
}) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();

  function change(locale: Locale) {
    setCookie(LOCALE_COOKIE, locale);
    document.documentElement.lang = locale;
    start(() => router.refresh());
  }

  return (
    <div
      className={
        variant === "pill"
          ? `flex items-center rounded-full border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900 ${className}`
          : `flex gap-1 ${className}`
      }
      role="group"
      aria-label={t("Til")}
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => change(l)}
          disabled={pending}
          aria-pressed={t.locale === l}
          title={LOCALE_NAMES[l]}
          data-testid={`lang-${l}`}
          className={`${
            variant === "pill" ? "rounded-full px-2.5 py-1 text-[11px]" : "rounded-md px-2 py-1 text-xs"
          } font-semibold uppercase transition disabled:opacity-50 ${
            t.locale === l
              ? "bg-indigo-600 text-white shadow-sm"
              : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

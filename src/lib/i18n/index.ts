/**
 * Interfeys tili: o'zbek (asosiy), ingliz va rus.
 *
 * Kalit sifatida o'zbekcha matnning o'zi ishlatiladi: `t("Mijozlar")`.
 * Nega raqamli kalit ("nav.clients") emas: loyihada hamma matn o'zbekcha
 * yozilgan va jamoa ham o'zbekcha o'qiydi — kodni o'qiganda sahifada nima
 * yozilgani darhol ko'rinadi. Tarjima topilmasa o'zbekchasi chiqadi, ya'ni
 * yangi matn qo'shib, tarjimasini unutsangiz sahifa buzilmaydi.
 *
 * Bu fayl serverda ham, brauzerda ham ishlaydi — cookie o'qimaydi.
 */
import { en } from "./en";
import { ru } from "./ru";

export const LOCALES = ["uz", "en", "ru"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "uz";
export const LOCALE_COOKIE = "lang";

export const LOCALE_NAMES: Record<Locale, string> = {
  uz: "O'zbekcha",
  en: "English",
  ru: "Русский",
};

export type Dict = Record<string, string>;

const DICTS: Record<Locale, Dict> = { uz: {}, en, ru };

export function isLocale(x: unknown): x is Locale {
  return typeof x === "string" && (LOCALES as readonly string[]).includes(x);
}

export function dictFor(locale: Locale): Dict {
  return DICTS[locale];
}

export type Vars = Record<string, string | number>;

/** "{n} ta seans" ichidagi {n} ni almashtiradi */
function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/* ---------- Sana va pul (tilga qarab) ---------- */

const MONTHS: Record<Locale, string[]> = {
  uz: ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  // Sana ichida ("14 марта") qaratqich kelishigi kerak, oy nomi yolg'iz turganda — bosh kelishik
  ru: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
};

const MONTHS_STANDALONE: Record<Locale, string[]> = {
  uz: MONTHS.uz,
  en: MONTHS.en,
  ru: ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"],
};

/** 0 = yakshanba (Date.getDay() tartibida) */
const WEEKDAYS: Record<Locale, string[]> = {
  uz: ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  ru: ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"],
};

const WEEKDAYS_SHORT: Record<Locale, string[]> = {
  uz: ["Yak", "Dush", "Sesh", "Chor", "Pay", "Jum", "Shan"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  ru: ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
};

const CURRENCY: Record<Locale, string> = { uz: "so'm", en: "UZS", ru: "сум" };

function amount(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n));
}

/** Yoshni so'z bilan: "4 yosh 3 oy" / "4 y 3 mo" / "4 г. 3 мес." */
function ageText(locale: Locale, years: number, months: number): string {
  const y = { uz: "yosh", en: "y", ru: "г." }[locale];
  const m = { uz: "oy", en: "mo", ru: "мес." }[locale];
  if (years <= 0) return `${Math.max(months, 0)} ${m}`;
  return months > 0 ? `${years} ${y} ${months} ${m}` : `${years} ${y}`;
}

export type T = ((text: string, vars?: Vars) => string) & {
  locale: Locale;
  money: (n: number) => string;
  currency: string;
  date: (d: Date | string) => string;
  monthYear: (d: Date | string) => string;
  month: (index: number) => string;
  weekday: (d: Date | string) => string;
  weekdayShort: (d: Date | string) => string;
  /** 1 = dushanba ... 7 = yakshanba (Sozlamalardagi tartib) */
  isoWeekday: (iso: number) => string;
  age: (birth: Date | string, now?: Date) => string;
};

export function makeT(locale: Locale, dict: Dict = dictFor(locale)): T {
  const t = ((text: string, vars?: Vars) => fill(dict[text] ?? text, vars)) as T;
  t.locale = locale;
  t.currency = CURRENCY[locale];
  t.money = (n) => `${amount(n)} ${CURRENCY[locale]}`;
  t.date = (d) => {
    const x = new Date(d);
    if (locale === "en") return `${MONTHS.en[x.getMonth()]} ${x.getDate()}, ${x.getFullYear()}`;
    return `${x.getDate()} ${MONTHS[locale][x.getMonth()]} ${x.getFullYear()}`;
  };
  t.monthYear = (d) => {
    const x = new Date(d);
    return `${MONTHS_STANDALONE[locale][x.getMonth()]} ${x.getFullYear()}`;
  };
  t.month = (i) => MONTHS_STANDALONE[locale][i];
  t.weekday = (d) => WEEKDAYS[locale][new Date(d).getDay()];
  t.weekdayShort = (d) => WEEKDAYS_SHORT[locale][new Date(d).getDay()];
  t.isoWeekday = (iso) => WEEKDAYS[locale][iso % 7];
  t.age = (birth, now = new Date()) => {
    const b = new Date(birth);
    let years = now.getFullYear() - b.getFullYear();
    let months = now.getMonth() - b.getMonth();
    if (now.getDate() < b.getDate()) months -= 1;
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    return ageText(locale, years, months);
  };
  return t;
}

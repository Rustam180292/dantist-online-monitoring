import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, makeT, type Locale, type T } from "./index";
import { dictFor } from "./dicts";

/**
 * Tanlangan til cookie'da saqlanadi (akkauntda emas): bitta qabulxona
 * kompyuteridan bir nechta xodim kiradi, til esa o'sha kompyuterga tegishli
 * tanlov. Bundan tashqari kirish sahifasi ham — hali hech kim kirmagan payt —
 * tanlangan tilda ochilishi kerak.
 *
 * `cache` bitta so'rov ichida cookie'ni qayta-qayta o'qimaslik uchun.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const jar = await cookies();
  const v = jar.get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
});

export const getT = cache(async (): Promise<T> => {
  const locale = await getLocale();
  return makeT(locale, dictFor(locale));
});

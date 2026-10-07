"use client";

import { createContext, useContext, useMemo } from "react";
import { makeT, type Dict, type Locale, type T } from "@/lib/i18n";

/**
 * Brauzerdagi komponentlar uchun tarjima.
 *
 * Lug'at serverdan prop bo'lib keladi va faqat tanlangan til yuboriladi —
 * uchala tilni har sahifaga qo'shib jo'natmaslik uchun.
 */
const Ctx = createContext<T>(makeT("uz", {}));

export function I18nProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dict;
  children: React.ReactNode;
}) {
  const t = useMemo(() => makeT(locale, dict), [locale, dict]);
  return <Ctx.Provider value={t}>{children}</Ctx.Provider>;
}

export function useT(): T {
  return useContext(Ctx);
}

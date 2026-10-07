/**
 * Lug'atlarning o'zi — alohida faylda.
 *
 * Nega `index.ts` da emas: `index.ts` ni brauzerdagi komponent ham ishlatadi
 * (`makeT`), va u yerdan `en`/`ru` ni import qilsak ikkala lug'at har bir
 * sahifaga qo'shilib ketardi (~70 KB), holbuki serverdan tanlangan bittasi
 * `dict` prop bo'lib allaqachon kelyapti.
 *
 * Bu faylni faqat server komponenti chaqiradi.
 */
import { en } from "./en";
import { ru } from "./ru";
import { type Dict, type Locale } from "./index";

const DICTS: Record<Locale, Dict> = { uz: {}, en, ru };

export function dictFor(locale: Locale): Dict {
  return DICTS[locale];
}

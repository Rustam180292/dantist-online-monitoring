import { I18nProvider } from "@/components/i18n";
import { dictFor } from "@/lib/i18n/dicts";
import { getLocale } from "@/lib/i18n/server";

/**
 * O'rnatish yo'riqnomasi kirishsiz ochiladi — tilni cookie'dan olamiz.
 *
 * Cookie o'qilgani uchun bu sahifa statik emas, har so'rovda serverda
 * chiziladi. Ataylab shunday: muqobili — uchala lug'atni brauzerga yuborish
 * (~70 KB) edi, bu esa statik sahifadan qimmatroq tushardi.
 */
export default async function InstallLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <I18nProvider locale={locale} dict={dictFor(locale)}>
      {children}
    </I18nProvider>
  );
}

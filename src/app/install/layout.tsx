import { I18nProvider } from "@/components/i18n";
import { dictFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

/** O'rnatish yo'riqnomasi kirishsiz ochiladi — tilni cookie'dan olamiz */
export default async function InstallLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <I18nProvider locale={locale} dict={dictFor(locale)}>
      {children}
    </I18nProvider>
  );
}

import Link from "next/link";
import Script from "next/script";
import { requireUser } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { Flash } from "@/components/flash";
import { Install } from "@/components/install";

export const metadata = {
  title: "Logoped CRM — kabinet",
};

/**
 * Telefon kabineti: mutaxassis va ota-ona uchun ixcham ko'rinish.
 * Ham brauzerda (telefonga o'rnatilgan ilova), ham Telegram ichida ishlaydi.
 */
export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const fullViewHref = user.role === "PARENT" ? "/my" : "/schedule";

  return (
    <div className="app-shell flex min-h-screen flex-col">
      {/* Telegram ichida ochilsa mavzu ranglarini oladi; tashqarida hech nimaga xalaqit bermaydi */}
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />

      <div className="flex-1">{children}</div>

      <footer className="mx-auto w-full max-w-md space-y-4 px-4 py-5 text-sm">
        <Install variant="banner" />
        <div className="flex items-center justify-between gap-3">
          <Link href={fullViewHref} className="app-link font-medium">
            To&apos;liq ko&apos;rinish →
          </Link>
          <Link href="/settings" className="app-muted font-medium">
            Parol
          </Link>
          <form action={logout}>
            <button type="submit" className="app-muted font-medium">
              Chiqish
            </button>
          </form>
        </div>
      </footer>

      <Flash />
    </div>
  );
}

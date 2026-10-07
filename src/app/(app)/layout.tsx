import { requireUser } from "@/lib/auth";
import { ROLES, SPECIALIZATIONS, type Specialization } from "@/lib/constants";
import { MobileNav, SideNav, type NavItem } from "@/components/nav";
import { Icon } from "@/components/icons";
import { Flash } from "@/components/flash";
import { Install } from "@/components/install";
import { logout } from "@/app/login/actions";
import { BrandMark } from "@/components/brand";
import { I18nProvider } from "@/components/i18n";
import { LanguageSwitcher, ThemeToggle } from "@/components/prefs";
import { getSettings } from "@/lib/settings";
import { dictFor } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const t = await getT();
  const { logoUrl } = await getSettings();

  const items: NavItem[] = [];
  if (user.role === "PARENT") {
    items.push({ href: "/m", label: t("Kabinet"), icon: "phone" });
    items.push({ href: "/my", label: t("Farzandim"), icon: "child" });
  } else {
    // Mutaxassisning uy sahifasi — telefon kabineti
    if (user.role === "SPECIALIST") {
      items.push({ href: "/m", label: t("Kabinet"), icon: "phone" });
    } else if (user.role !== "RECEPTION") {
      items.push({ href: "/", label: t("Panel"), icon: "home" });
    }
    items.push({ href: "/schedule", label: t("Jadval"), icon: "calendar" });
    // Bo'sh vaqtlar: qabulxona xodimi telefonda turib vaqt tanlashi uchun
    if (user.role !== "SPECIALIST") {
      items.push({ href: "/slots", label: t("Bo'sh vaqtlar"), icon: "clock" });
    }
    // Qabul — markazga birinchi marta kelgan odam; mutaxassisga u ko'rinmaydi
    if (user.role !== "SPECIALIST") {
      items.push({ href: "/intakes", label: t("Qabullar"), icon: "door" });
    }
    items.push({ href: "/clients", label: t("Mijozlar"), icon: "users" });
    if (user.role === "SPECIALIST") {
      items.push({ href: "/earnings", label: t("Pulim"), icon: "wallet" });
    } else if (user.role === "RECEPTION") {
      // Qabulxona xodimiga maosh, xodimlar va hisobotlar ko'rinmaydi
      items.push({ href: "/payments", label: t("To'lovlar"), icon: "wallet" });
    } else {
      items.push({ href: "/specialists", label: t("Xodimlar"), icon: "badge" });
      if (user.role === "OWNER") {
        items.push({ href: "/branches", label: t("Filiallar"), icon: "building" });
      }
      items.push({ href: "/payments", label: t("To'lovlar"), icon: "wallet" });
      items.push({ href: "/reports", label: t("Hisobotlar"), icon: "chart" });
    }
  }

  items.push({ href: "/settings", label: t("Sozlamalar"), icon: "gear" });

  const roleLine =
    user.role === "SPECIALIST" && user.specialization
      ? t(SPECIALIZATIONS[user.specialization as Specialization])
      : t(ROLES[user.role]);

  const prefBtn =
    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800";

  return (
    <I18nProvider locale={t.locale} dict={dictFor(t.locale)}>
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <BrandMark logoUrl={logoUrl} />
          <div className="leading-tight">
            <p className="text-sm font-bold text-slate-900 dark:text-white">Logoped CRM</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {user.branchName ?? t("Barcha filiallar")}
            </p>
          </div>
        </div>

        <div className="flex-1 px-3">
          <SideNav items={items} />
        </div>

        <div className="border-t border-slate-200 p-3 dark:border-slate-800">
          <p className="px-2 text-sm font-medium text-slate-800 dark:text-slate-200">
            {user.fullName}
          </p>
          <p className="mb-2 px-2 text-xs text-slate-500 dark:text-slate-400">{roleLine}</p>
          <LanguageSwitcher className="mb-1 px-2" />
          <ThemeToggle className={prefBtn} />
          <Install className={`mb-1 ${prefBtn}`} />
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <Icon name="logout" className="h-4 w-4" />
              {t("Chiqish")}
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <BrandMark logoUrl={logoUrl} size="sm" />
            <div className="leading-tight">
              <p className="text-sm font-bold text-slate-900 dark:text-white">Logoped CRM</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {user.fullName} · {roleLine}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
          <ThemeToggle className="rounded-lg border border-slate-200 p-2 text-slate-600 dark:border-slate-700 dark:text-slate-400 [&>span]:hidden" />
          <form action={logout}>
            <button
              type="submit"
              aria-label={t("Chiqish")}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 dark:border-slate-700 dark:text-slate-400"
            >
              <Icon name="logout" className="h-4 w-4" />
            </button>
          </form>
          </div>
        </header>

        <MobileNav items={items} />

        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {/* Telefonda yon menyu yashiringani uchun o'rnatish taklifi shu yerda ko'rinadi */}
          <Install variant="banner" className="mb-5 lg:hidden" />
          {children}
        </main>
      </div>

      <Flash />
    </div>
    </I18nProvider>
  );
}

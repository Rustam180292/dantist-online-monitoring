import { requireUser } from "@/lib/auth";
import { ROLES, SPECIALIZATIONS, type Specialization } from "@/lib/constants";
import { MobileNav, SideNav, type NavItem } from "@/components/nav";
import { Icon } from "@/components/icons";
import { Flash } from "@/components/flash";
import { logout } from "@/app/login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const items: NavItem[] = [];
  if (user.role === "PARENT") {
    items.push({ href: "/m", label: "Kabinet", icon: "phone" });
    items.push({ href: "/my", label: "Farzandim", icon: "child" });
  } else {
    // Mutaxassisning uy sahifasi — telefon kabineti
    if (user.role === "SPECIALIST") {
      items.push({ href: "/m", label: "Kabinet", icon: "phone" });
    } else if (user.role !== "RECEPTION") {
      items.push({ href: "/", label: "Panel", icon: "home" });
    }
    items.push({ href: "/schedule", label: "Jadval", icon: "calendar" });
    items.push({ href: "/clients", label: "Mijozlar", icon: "users" });
    if (user.role === "SPECIALIST") {
      items.push({ href: "/earnings", label: "Pulim", icon: "wallet" });
    } else if (user.role === "RECEPTION") {
      // Qabulxona xodimiga maosh, xodimlar va hisobotlar ko'rinmaydi
      items.push({ href: "/payments", label: "To'lovlar", icon: "wallet" });
    } else {
      items.push({ href: "/specialists", label: "Xodimlar", icon: "badge" });
      items.push({ href: "/payments", label: "To'lovlar", icon: "wallet" });
      items.push({ href: "/reports", label: "Hisobotlar", icon: "chart" });
    }
  }

  const roleLine =
    user.role === "SPECIALIST" && user.specialization
      ? SPECIALIZATIONS[user.specialization as Specialization]
      : ROLES[user.role];

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            L
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold text-slate-900 dark:text-white">Logoped CRM</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {user.branchName ?? "Barcha filiallar"}
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
          <a
            href="/install"
            className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <Icon name="phone" className="h-4 w-4" />
            Telefonga o&apos;rnatish
          </a>
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <Icon name="logout" className="h-4 w-4" />
              Chiqish
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white">
              L
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold text-slate-900 dark:text-white">Logoped CRM</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {user.fullName} · {roleLine}
              </p>
            </div>
          </div>
          <form action={logout}>
            <button
              type="submit"
              aria-label="Chiqish"
              className="rounded-lg border border-slate-200 p-2 text-slate-600 dark:border-slate-700 dark:text-slate-400"
            >
              <Icon name="logout" className="h-4 w-4" />
            </button>
          </form>
        </header>

        <MobileNav items={items} />

        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>

      <Flash />
    </div>
  );
}

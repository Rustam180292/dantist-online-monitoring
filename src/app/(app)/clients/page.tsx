import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { clientScope, requireUser } from "@/lib/auth";
import {
  BILLABLE_STATUSES,
  CLIENT_STATUSES,
  CLIENT_STATUS_KEYS,
  SPECIALIZATIONS,
  type ClientStatus,
  type Specialization,
} from "@/lib/constants";
import { ageUz, money } from "@/lib/format";
import {
  Badge,
  Card,
  Empty,
  PageHeader,
  btnPrimary,
  card,
  input,
  label,
  td,
  th,
} from "@/components/ui";
import { createClient } from "./actions";
import { ClientFilters } from "./filters";

type Search = {
  n?: string;
  p?: string;
  age?: string;
  sp?: string;
  rem?: string;
  b?: string;
  st?: string;
};

/**
 * Berilgan yoshdagi bolalarning tug'ilgan sana oralig'i.
 *
 * Yoshni bazada saqlamaymiz — u tug'ilgan sanadan hisoblanadi, aks holda har
 * yili eskirib qolardi. Shuning uchun filtr sanaga aylantiriladi.
 */
function birthRangeForAge(age: number): { gt: Date; lte: Date } {
  const now = new Date();
  const lte = new Date(now);
  lte.setFullYear(now.getFullYear() - age);
  const gt = new Date(now);
  gt.setFullYear(now.getFullYear() - age - 1);
  return { gt, lte };
}

/** Filtrda tanlanadigan yoshlar — logopedik markazga keladigan yosh oralig'i */
const AGE_OPTIONS = Array.from({ length: 16 }, (_, i) => i + 2);

const STATUS_STYLE: Record<ClientStatus, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
  PAUSED: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900",
  ARCHIVED: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700",
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const canManage =
    user.role === "OWNER" || user.role === "BRANCH_ADMIN" || user.role === "RECEPTION";

  const nameFilter = (sp.n ?? "").trim();
  const phoneFilter = (sp.p ?? "").trim();
  const ageFilter = /^\d{1,2}$/.test(sp.age ?? "") ? Number(sp.age) : null;
  const specialistFilter = (sp.sp ?? "").trim();
  const remainingFilter = sp.rem === "0" || sp.rem === "low" || sp.rem === "ok" ? sp.rem : null;
  const statusFilter = CLIENT_STATUS_KEYS.includes(sp.st as ClientStatus)
    ? (sp.st as ClientStatus)
    : null;
  const hasFilter = Boolean(
    nameFilter || phoneFilter || ageFilter !== null || specialistFilter || remainingFilter ||
      statusFilter || sp.b,
  );

  const [clients, branches, specialists] = await Promise.all([
    prisma.client.findMany({
      where: {
        ...clientScope(user),
        ...(user.role === "OWNER" && sp.b ? { branchId: sp.b } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(ageFilter !== null ? { birthDate: birthRangeForAge(ageFilter) } : {}),
        ...(specialistFilter ? { specialists: { some: { specialistId: specialistFilter } } } : {}),
        ...(nameFilter
          ? {
              OR: [
                { fullName: { contains: nameFilter, mode: "insensitive" as const } },
                { parentName: { contains: nameFilter, mode: "insensitive" as const } },
              ],
            }
          : {}),
        ...(phoneFilter ? { parentPhone: { contains: phoneFilter } } : {}),
      },
      orderBy: [{ status: "asc" }, { fullName: "asc" }],
      include: {
        branch: { select: { name: true } },
        specialists: {
          include: {
            specialist: {
              select: { specialization: true, user: { select: { fullName: true } } },
            },
          },
        },
        packages: {
          where: { isActive: true },
          select: {
            totalSessions: true,
            pricePerSession: true,
            sessions: { select: { status: true } },
            payments: { select: { amount: true } },
          },
        },
      },
    }),
    user.role === "OWNER" ? prisma.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
    // Filtr ro'yxati uchun: mutaxassis o'ziniki bilan cheklanadi
    prisma.specialist.findMany({
      where: {
        isActive: true,
        ...(user.role === "SPECIALIST" ? { id: user.specialistId ?? "" } : {}),
        ...(user.role === "BRANCH_ADMIN" || user.role === "RECEPTION"
          ? { branchId: user.branchId ?? "" }
          : {}),
      },
      select: { id: true, user: { select: { fullName: true } } },
      orderBy: { user: { fullName: "asc" } },
    }),
  ]);

  const rows = clients.map((c) => {
    let remaining = 0;
    let debt = 0;
    for (const p of c.packages) {
      const used = p.sessions.filter((s) =>
        BILLABLE_STATUSES.includes(s.status as never),
      ).length;
      remaining += Math.max(p.totalSessions - used, 0);
      const paid = p.payments.reduce((sum, x) => sum + x.amount, 0);
      debt += Math.max(p.totalSessions * p.pricePerSession - paid, 0);
    }
    return { ...c, remaining, debt };
  });

  // Qolgan seans bazada saqlanmaydi (abonement va o'tgan seanslardan hisoblanadi),
  // shuning uchun bu filtr hisoblangandan keyin qo'llanadi.
  const visible = remainingFilter
    ? rows.filter((c) =>
        remainingFilter === "0"
          ? c.remaining === 0
          : remainingFilter === "low"
            ? c.remaining > 0 && c.remaining <= 2
            : c.remaining > 2,
      )
    : rows;

  return (
    <>
      <PageHeader
        title="Mijozlar"
        subtitle={`${visible.length} ta mijoz${
          rows.length !== visible.length ? ` (jami ${rows.length})` : ""
        }${user.role === "SPECIALIST" ? " · menga biriktirilgan" : ""}`}
      />

      {canManage ? (
        <details className={`${card} mb-5 p-4`}>
          <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-200">
            + Yangi mijoz qo&apos;shish
          </summary>
          <form action={createClient} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className={label} htmlFor="fullName">
                Bolaning F.I.Sh. *
              </label>
              <input id="fullName" name="fullName" className={input} required />
            </div>
            <div>
              <label className={label} htmlFor="birthDate">
                Tug&apos;ilgan sana *
              </label>
              <input id="birthDate" name="birthDate" type="date" className={input} required />
            </div>
            <div>
              <label className={label} htmlFor="gender">
                Jinsi
              </label>
              <select id="gender" name="gender" className={input}>
                <option value="">—</option>
                <option value="M">O&apos;g&apos;il bola</option>
                <option value="F">Qiz bola</option>
              </select>
            </div>
            {user.role === "OWNER" ? (
              <div>
                <label className={label} htmlFor="branchId">
                  Filial *
                </label>
                <select id="branchId" name="branchId" className={input} required>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div>
              <label className={label} htmlFor="parentName">
                Ota-ona F.I.Sh. *
              </label>
              <input id="parentName" name="parentName" className={input} required />
            </div>
            <div>
              <label className={label} htmlFor="parentPhone">
                Ota-ona telefoni *
              </label>
              <input
                id="parentPhone"
                name="parentPhone"
                type="tel"
                placeholder="+998901234567"
                className={input}
                required
              />
            </div>
            <div>
              <label className={label} htmlFor="parentPassword">
                Ota-ona kabineti uchun parol
              </label>
              <input
                id="parentPassword"
                name="parentPassword"
                type="text"
                placeholder="bo'sh qoldirsangiz kabinet ochilmaydi"
                className={input}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor="diagnosis">
                Tashxis / shikoyat
              </label>
              <input id="diagnosis" name="diagnosis" className={input} />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className={label} htmlFor="note">
                Izoh
              </label>
              <input id="note" name="note" className={input} />
            </div>
            <div className="flex items-end">
              <button type="submit" className={`${btnPrimary} w-full`}>
                Saqlash
              </button>
            </div>
          </form>
        </details>
      ) : null}

      <Card>
        {rows.length === 0 && !hasFilter ? (
          <Empty>Hali mijoz qo&apos;shilmagan.</Empty>
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[1060px]">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className={th}>Bola</th>
                  <th className={th}>Yoshi</th>
                  {user.role === "OWNER" ? <th className={th}>Filial</th> : null}
                  <th className={th}>Mutaxassis</th>
                  <th className={th}>Ota-ona</th>
                  <th className={th}>Qolgan seans</th>
                  <th className={th}>Qarz</th>
                  <th className={th}>Holat</th>
                </tr>
                <ClientFilters
                  branches={user.role === "OWNER" ? branches.map((b) => ({ id: b.id, name: b.name })) : []}
                  specialists={specialists.map((x) => ({ id: x.id, name: x.user.fullName }))}
                  statuses={CLIENT_STATUS_KEYS.map((k) => ({ id: k, name: CLIENT_STATUSES[k] }))}
                  ages={AGE_OPTIONS}
                />
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visible.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className={td}>
                      <Link
                        href={`/clients/${c.id}`}
                        className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        {c.fullName}
                      </Link>
                      {c.diagnosis ? (
                        <span className="block max-w-[220px] truncate text-xs text-slate-400">
                          {c.diagnosis}
                        </span>
                      ) : null}
                    </td>
                    <td className={td}>{ageUz(c.birthDate)}</td>
                    {user.role === "OWNER" ? <td className={td}>{c.branch.name}</td> : null}
                    <td className={td}>
                      <div className="flex flex-wrap gap-1">
                        {c.specialists.length === 0 ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : (
                          c.specialists.map((a) => (
                            <span key={a.id} className="block whitespace-nowrap">
                              <span className="text-sm text-slate-700 dark:text-slate-300">
                                {a.specialist.user.fullName}
                              </span>
                              <span className="ml-1.5 text-xs text-slate-400">
                                {SPECIALIZATIONS[a.specialist.specialization as Specialization]}
                              </span>
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className={td}>
                      {c.parentName}
                      <span className="block text-xs text-slate-400">{c.parentPhone}</span>
                    </td>
                    <td className={`${td} tabular-nums`}>
                      <span
                        className={
                          c.remaining === 0
                            ? "font-semibold text-rose-600 dark:text-rose-400"
                            : c.remaining <= 2
                              ? "font-semibold text-amber-600 dark:text-amber-400"
                              : ""
                        }
                      >
                        {c.remaining}
                      </span>
                    </td>
                    <td className={`${td} tabular-nums`}>
                      {c.debt > 0 ? (
                        <span className="font-semibold text-rose-600 dark:text-rose-400">
                          {money(c.debt)}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className={td}>
                      <Badge className={STATUS_STYLE[c.status as ClientStatus]}>
                        {CLIENT_STATUSES[c.status as ClientStatus]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

    </>
  );
}

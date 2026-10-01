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

type Search = { q?: string; b?: string; st?: string };

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
  const isAdmin = user.role === "OWNER" || user.role === "BRANCH_ADMIN";

  const q = (sp.q ?? "").trim();
  const statusFilter = CLIENT_STATUS_KEYS.includes(sp.st as ClientStatus)
    ? (sp.st as ClientStatus)
    : null;

  const [clients, branches] = await Promise.all([
    prisma.client.findMany({
      where: {
        ...clientScope(user),
        ...(user.role === "OWNER" && sp.b ? { branchId: sp.b } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(q
          ? {
              OR: [
                { fullName: { contains: q } },
                { parentName: { contains: q } },
                { parentPhone: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: [{ status: "asc" }, { fullName: "asc" }],
      include: {
        branch: { select: { name: true } },
        specialists: {
          include: { specialist: { select: { specialization: true } } },
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

  return (
    <>
      <PageHeader
        title="Mijozlar"
        subtitle={`${rows.length} ta mijoz${
          user.role === "SPECIALIST" ? " (menga biriktirilgan)" : ""
        }`}
      />

      <form method="get" className={`${card} mb-5 flex flex-wrap items-end gap-3 p-4`}>
        <div className="min-w-[200px] flex-1">
          <label className={label} htmlFor="q">
            Qidirish
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="Bola ismi, ota-ona ismi yoki telefon"
            className={input}
          />
        </div>
        {branches.length > 0 ? (
          <div className="min-w-[170px]">
            <label className={label} htmlFor="b">
              Filial
            </label>
            <select id="b" name="b" defaultValue={sp.b ?? ""} className={input}>
              <option value="">Barchasi</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="min-w-[150px]">
          <label className={label} htmlFor="st">
            Holat
          </label>
          <select id="st" name="st" defaultValue={sp.st ?? ""} className={input}>
            <option value="">Barchasi</option>
            {CLIENT_STATUS_KEYS.map((s) => (
              <option key={s} value={s}>
                {CLIENT_STATUSES[s]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={btnPrimary}>
          Qidirish
        </button>
      </form>

      {isAdmin ? (
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
        {rows.length === 0 ? (
          <Empty>Mijoz topilmadi.</Empty>
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[820px]">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className={th}>Bola</th>
                  <th className={th}>Yoshi</th>
                  {user.role === "OWNER" ? <th className={th}>Filial</th> : null}
                  <th className={th}>Mutaxassislar</th>
                  <th className={th}>Ota-ona</th>
                  <th className={th}>Qolgan seans</th>
                  <th className={th}>Qarz</th>
                  <th className={th}>Holat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((c) => (
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
                            <Badge key={a.id}>
                              {SPECIALIZATIONS[a.specialist.specialization as Specialization]}
                            </Badge>
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

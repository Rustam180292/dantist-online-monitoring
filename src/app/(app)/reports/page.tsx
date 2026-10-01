import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import {
  BILLABLE_STATUSES,
  SPECIALIZATIONS,
  type SessionStatus,
  type Specialization,
} from "@/lib/constants";
import { getOverview, getSpecialistRows, monthRange } from "@/lib/stats";
import { money, monthYearUz, num } from "@/lib/format";
import { Card, Empty, PageHeader, StatCard, btn, td, th } from "@/components/ui";

type Search = { m?: string };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requireRole("OWNER", "BRANCH_ADMIN");
  const sp = await searchParams;

  const offset = Number.parseInt(sp.m ?? "0", 10) || 0;
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + offset);
  const { from, to } = monthRange(base);

  const branchId = user.role === "OWNER" ? null : user.branchId;

  const [overview, specialistRows, branches, sessions] = await Promise.all([
    getOverview({ branchId, from, to }),
    getSpecialistRows({ branchId, from, to }),
    user.role === "OWNER" ? prisma.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
    prisma.session.findMany({
      where: {
        startsAt: { gte: from, lt: to },
        ...(branchId ? { branchId } : {}),
      },
      select: {
        status: true,
        price: true,
        branchId: true,
        specialist: { select: { specialization: true } },
      },
    }),
  ]);

  // Filiallar kesimi
  const branchStats = await Promise.all(
    branches.map(async (b) => {
      const ov = await getOverview({ branchId: b.id, from, to });
      const clients = await prisma.client.count({
        where: { branchId: b.id, status: "ACTIVE" },
      });
      return { ...b, ...ov, clients };
    }),
  );

  // Yo'nalishlar kesimi
  const bySpec = new Map<string, { done: number; revenue: number }>();
  for (const s of sessions) {
    const key = s.specialist.specialization;
    const cur = bySpec.get(key) ?? { done: 0, revenue: 0 };
    if (s.status === "DONE") cur.done++;
    if (BILLABLE_STATUSES.includes(s.status as SessionStatus)) cur.revenue += s.price;
    bySpec.set(key, cur);
  }
  const specRows = [...bySpec.entries()]
    .map(([k, v]) => ({ specialization: k, ...v }))
    .sort((a, b) => b.revenue - a.revenue);

  const qs = (o: number) => `/reports?m=${o}`;
  const profit = overview.earned - overview.salary;

  return (
    <>
      <PageHeader
        title="Hisobotlar"
        subtitle={`${monthYearUz(from)} · ${user.branchName ?? "barcha filiallar"}`}
        action={
          <div className="flex gap-2">
            <Link href={qs(offset - 1)} className={btn}>
              ← O&apos;tgan oy
            </Link>
            {offset !== 0 ? (
              <Link href={qs(0)} className={btn}>
                Bu oy
              </Link>
            ) : null}
            {offset < 0 ? (
              <Link href={qs(offset + 1)} className={btn}>
                Keyingi oy →
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="O'tgan seanslar" value={num(overview.done)} tone="good" />
        <StatCard
          label="Davomat"
          value={overview.attendanceRate === null ? "—" : `${overview.attendanceRate}%`}
          hint={`${overview.noShow} kelmadi · ${overview.cancelled} bekor`}
        />
        <StatCard label="Kassaga tushgan" value={money(overview.collected)} />
        <StatCard label="Xizmat qiymati" value={money(overview.earned)} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Mutaxassis haqi" value={money(overview.salary)} tone="warn" />
        <StatCard
          label="Markaz ulushi"
          value={money(profit)}
          hint="xizmat qiymati − ish haqi"
          tone="good"
        />
        <StatCard label="Rejadagi seanslar" value={num(overview.planned)} />
        <StatCard label="Jami seanslar" value={num(overview.total)} />
      </div>

      {branchStats.length > 0 ? (
        <Card title="Filiallar kesimi" className="mt-5">
          <div className="scroll-x">
            <table className="w-full min-w-[820px]">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className={th}>Filial</th>
                  <th className={th}>Faol mijoz</th>
                  <th className={th}>O&apos;tdi</th>
                  <th className={th}>Davomat</th>
                  <th className={th}>Tushum</th>
                  <th className={th}>Xizmat qiymati</th>
                  <th className={th}>Ish haqi</th>
                  <th className={th}>Markaz ulushi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {branchStats.map((b) => (
                  <tr key={b.id}>
                    <td className={`${td} font-medium`}>{b.name}</td>
                    <td className={`${td} tabular-nums`}>{b.clients}</td>
                    <td className={`${td} tabular-nums`}>{b.done}</td>
                    <td className={`${td} tabular-nums`}>
                      {b.attendanceRate === null ? "—" : `${b.attendanceRate}%`}
                    </td>
                    <td className={`${td} tabular-nums`}>{money(b.collected)}</td>
                    <td className={`${td} tabular-nums`}>{money(b.earned)}</td>
                    <td className={`${td} tabular-nums`}>{money(b.salary)}</td>
                    <td className={`${td} font-semibold tabular-nums`}>
                      {money(b.earned - b.salary)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card title="Mutaxassislar bo'yicha">
          {specialistRows.length === 0 ? (
            <Empty>Ma&apos;lumot yo&apos;q.</Empty>
          ) : (
            <div className="scroll-x">
              <table className="w-full min-w-[520px]">
                <thead className="border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className={th}>Mutaxassis</th>
                    <th className={th}>O&apos;tdi</th>
                    <th className={th}>Xizmat</th>
                    <th className={th}>Ish haqi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {specialistRows.map((r) => (
                    <tr key={r.id}>
                      <td className={td}>
                        {r.fullName}
                        <span className="block text-xs text-slate-400">
                          {SPECIALIZATIONS[r.specialization as Specialization]}
                          {!branchId ? ` · ${r.branchName}` : ""}
                        </span>
                      </td>
                      <td className={`${td} tabular-nums`}>{r.done}</td>
                      <td className={`${td} tabular-nums`}>{money(r.revenue)}</td>
                      <td className={`${td} font-semibold tabular-nums`}>{money(r.salary)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Yo'nalishlar bo'yicha">
          {specRows.length === 0 ? (
            <Empty>Ma&apos;lumot yo&apos;q.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {specRows.map((r) => {
                const max = specRows[0].revenue || 1;
                const pct = Math.round((r.revenue / max) * 100);
                return (
                  <li key={r.specialization} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {SPECIALIZATIONS[r.specialization as Specialization]}
                      </span>
                      <span className="tabular-nums text-slate-600 dark:text-slate-400">
                        {r.done} seans · {money(r.revenue)}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-indigo-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

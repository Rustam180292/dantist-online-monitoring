import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  SESSION_STATUSES,
  SESSION_STATUS_STYLE,
  SPECIALIZATIONS,
  type SessionStatus,
  type Specialization,
} from "@/lib/constants";
import {
  dayRange,
  getClientAlerts,
  getOverview,
  getSpecialistRows,
  monthRange,
} from "@/lib/stats";
import { money, monthYearUz, num, timeUz } from "@/lib/format";
import { Badge, Card, Empty, PageHeader, StatCard, td, th } from "@/components/ui";

export default async function DashboardPage() {
  const user = await requireUser();
  // Mutaxassis va ota-ona uchun telefon kabineti qulayroq — katta jadvallar
  // ularga kerak emas. "To'liq ko'rinish" havolasi orqali bu yerga qaytishadi.
  if (user.role === "SPECIALIST" || user.role === "PARENT") redirect("/m");

  const branchId = user.role === "OWNER" ? null : user.branchId;
  const month = monthRange();
  const today = dayRange();

  const [overview, todaySessions, activeClients, specialistRows, alerts] = await Promise.all([
    getOverview({ branchId, ...month }),
    prisma.session.findMany({
      where: {
        startsAt: { gte: today.from, lt: today.to },
        ...(branchId ? { branchId } : {}),
      },
      orderBy: { startsAt: "asc" },
      include: {
        client: { select: { id: true, fullName: true } },
        specialist: { include: { user: { select: { fullName: true } } } },
        branch: { select: { name: true } },
      },
    }),
    prisma.client.count({
      where: {
        status: "ACTIVE",
        ...(branchId ? { branchId } : {}),
      },
    }),
    getSpecialistRows({ branchId, ...month }),
    getClientAlerts({ branchId }),
  ]);

  return (
    <>
      <PageHeader
        title={`Assalomu alaykum, ${user.fullName.split(" ")[0]}!`}
        subtitle={`${monthYearUz(new Date())} · ${
          user.branchName ?? "barcha filiallar"
        } bo'yicha ko'rsatkichlar`}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Faol mijozlar"
          value={num(activeClients)}
          hint={branchId ? "bu filialda" : "barcha filiallarda"}
        />
        <StatCard
          label="O'tgan seanslar"
          value={num(overview.done)}
          hint={`${overview.planned} ta rejada`}
          tone="good"
        />
        <StatCard
          label="Davomat"
          value={overview.attendanceRate === null ? "—" : `${overview.attendanceRate}%`}
          hint={`${overview.noShow} ta kelmadi`}
          tone={
            overview.attendanceRate === null
              ? "default"
              : overview.attendanceRate >= 85
                ? "good"
                : overview.attendanceRate >= 70
                  ? "warn"
                  : "bad"
          }
        />
        <StatCard
          label="Kassaga tushgan"
          value={money(overview.collected)}
          hint={`xizmat qiymati ${money(overview.earned)}`}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Xizmat qiymati" value={money(overview.earned)} hint="o'tgan seanslar" />
          <StatCard
            label="Mutaxassis haqi"
            value={money(overview.salary)}
            hint="hisoblangan"
            tone="warn"
          />
          <StatCard
            label="Markaz ulushi"
            value={money(overview.earned - overview.salary)}
            hint="xizmat qiymati − ish haqi"
            tone="good"
          />
          <StatCard
            label="Qarzdorlik"
            value={money(alerts.debtors.reduce((s, d) => s + d.debt, 0))}
            hint={`${alerts.debtors.length} ta abonement`}
            tone={alerts.debtors.length ? "bad" : "default"}
          href="/payments"
        />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="Bugungi jadval"
          subtitle={`${todaySessions.length} ta seans`}
          action={
            <Link href="/schedule" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              Butun hafta →
            </Link>
          }
        >
          {todaySessions.length === 0 ? (
            <Empty>Bugunga seans belgilanmagan.</Empty>
          ) : (
            <div className="scroll-x">
              <table className="w-full min-w-[640px]">
                <thead className="border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className={th}>Vaqt</th>
                    <th className={th}>Mijoz</th>
                    <th className={th}>Mutaxassis</th>
                    {!branchId ? <th className={th}>Filial</th> : null}
                    <th className={th}>Holat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {todaySessions.map((s) => (
                    <tr key={s.id}>
                      <td className={`${td} font-semibold tabular-nums`}>{timeUz(s.startsAt)}</td>
                      <td className={td}>
                        <Link
                          href={`/clients/${s.client.id}`}
                          className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                        >
                          {s.client.fullName}
                        </Link>
                      </td>
                      <td className={td}>
                        {s.specialist.user.fullName}
                        <span className="block text-xs text-slate-400">
                          {SPECIALIZATIONS[s.specialist.specialization as Specialization]}
                        </span>
                      </td>
                      {!branchId ? <td className={td}>{s.branch.name}</td> : null}
                      <td className={td}>
                        <Badge className={SESSION_STATUS_STYLE[s.status as SessionStatus]}>
                          {SESSION_STATUSES[s.status as SessionStatus]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card title="Abonementi tugayotganlar" subtitle="2 va kamroq seans qolgan">
              {alerts.ending.length === 0 ? (
                <Empty>Hammasining abonementi yetarli.</Empty>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {alerts.ending.slice(0, 6).map((a) => (
                    <li key={a.packageId} className="flex items-center justify-between gap-2 px-4 py-2.5">
                      <div className="min-w-0">
                        <Link
                          href={`/clients/${a.clientId}`}
                          className="block truncate text-sm font-medium text-slate-800 hover:underline dark:text-slate-200"
                        >
                          {a.clientName}
                        </Link>
                        <p className="truncate text-xs text-slate-400">
                          {SPECIALIZATIONS[a.specialization as Specialization]}
                        </p>
                      </div>
                      <Badge
                        className={
                          a.remaining === 0
                            ? "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-900"
                            : "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900"
                        }
                      >
                        {a.remaining} seans
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
          </Card>

          <Card title="Mutaxassislar" subtitle={`${monthYearUz(new Date())} natijalari`}>
              {specialistRows.length === 0 ? (
                <Empty>Mutaxassis qo&apos;shilmagan.</Empty>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {specialistRows.map((sp) => (
                    <li key={sp.id} className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                          {sp.fullName}
                        </p>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                          {sp.done} seans
                        </span>
                      </div>
                      <p className="truncate text-xs text-slate-400">
                        {SPECIALIZATIONS[sp.specialization as Specialization]} · {sp.clients} mijoz ·{" "}
                        {money(sp.salary)}
                      </p>
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

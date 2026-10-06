import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import {
  SESSION_STATUSES,
  SESSION_STATUS_STYLE,
  SPECIALIZATIONS,
  type SessionStatus,
  type Specialization,
} from "@/lib/constants";
import { getClientPackages } from "@/lib/stats";
import { ageUz, dateShort, money, timeUz, weekdayUz } from "@/lib/format";
import { Badge, Card, Empty, PageHeader, StatCard, td, th } from "@/components/ui";

export default async function MyChildrenPage() {
  const user = await requireUser();
  if (user.role !== "PARENT") redirect("/");

  const children = await prisma.client.findMany({
    where: { parentUserId: user.id },
    include: {
      branch: { select: { name: true, address: true, phone: true } },
      specialists: {
        include: { specialist: { include: { user: { select: { fullName: true } } } } },
      },
    },
    orderBy: { fullName: "asc" },
  });

  if (children.length === 0) {
    return (
      <>
        <PageHeader title="Farzandim" />
        <Card>
          <Empty>
            Hisobingizga farzand bog&apos;lanmagan. Iltimos, markaz administratoriga murojaat
            qiling.
          </Empty>
        </Card>
      </>
    );
  }

  const now = new Date();

  return (
    <>
      <PageHeader
        title="Farzandim"
        subtitle="Mashg'ulotlar jadvali, davomat va abonement holati"
      />

      <div className="space-y-8">
        {await Promise.all(
          children.map(async (child) => {
            const [packages, upcoming, history] = await Promise.all([
              getClientPackages(child.id),
              prisma.session.findMany({
                where: { clientId: child.id, startsAt: { gte: now }, status: "PLANNED" },
                orderBy: { startsAt: "asc" },
                take: 8,
                include: { specialist: { include: { user: { select: { fullName: true } } } } },
              }),
              prisma.session.findMany({
                where: { clientId: child.id, startsAt: { lt: now } },
                orderBy: { startsAt: "desc" },
                take: 10,
                include: { specialist: { include: { user: { select: { fullName: true } } } } },
              }),
            ]);

            const remaining = packages.reduce((s, p) => s + (p.isActive ? p.remaining : 0), 0);
            const debt = packages.reduce((s, p) => s + p.debt, 0);
            const doneAll = await prisma.session.count({
              where: { clientId: child.id, status: "DONE" },
            });

            return (
              <section key={child.id}>
                <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">
                  {child.fullName}
                  <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
                    {ageUz(child.birthDate)} · {child.branch.name}
                  </span>
                </h2>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {/* Kunlik to'laydigan bolada abonement tushunchasi yo'q */}
                  {child.billingType === "PACKAGE" ? (
                    <StatCard
                      label="Qolgan seans"
                      value={String(remaining)}
                      tone={remaining <= 2 ? "warn" : "good"}
                    />
                  ) : (
                    <StatCard label="To'lov turi" value="Kunlik" hint="har kelganida" />
                  )}
                  <StatCard label="Jami o'tgan mashg'ulot" value={String(doneAll)} />
                  <StatCard
                    label="Qarzdorlik"
                    value={debt > 0 ? money(debt) : "yo'q"}
                    tone={debt > 0 ? "bad" : "good"}
                  />
                  <StatCard
                    label="Mutaxassislar"
                    value={String(child.specialists.length)}
                    hint={child.specialists
                      .map((a) => SPECIALIZATIONS[a.specialist.specialization as Specialization])
                      .join(", ")}
                  />
                </div>

                <div className="mt-4 grid gap-5 xl:grid-cols-2">
                  <Card title="Keyingi mashg'ulotlar">
                    {upcoming.length === 0 ? (
                      <Empty>Rejada mashg&apos;ulot yo&apos;q.</Empty>
                    ) : (
                      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {upcoming.map((s) => (
                          <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="w-24 shrink-0">
                              <p className="text-sm font-bold text-slate-900 dark:text-white">
                                {timeUz(s.startsAt)}
                              </p>
                              <p className="text-xs text-slate-400">{dateShort(s.startsAt)}</p>
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                                {SPECIALIZATIONS[s.specialist.specialization as Specialization]}
                              </p>
                              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                {s.specialist.user.fullName} · {weekdayUz(s.startsAt)} ·{" "}
                                {s.durationMin} daqiqa
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>

                  <Card title="Abonement holati">
                    {packages.length === 0 ? (
                      <Empty>Abonement yo&apos;q.</Empty>
                    ) : (
                      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {packages.map((p) => (
                          <li key={p.id} className="px-4 py-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                {SPECIALIZATIONS[p.specialization as Specialization]}
                              </span>
                              <span className="text-sm tabular-nums text-slate-600 dark:text-slate-400">
                                {p.remaining} / {p.totalSessions} qoldi
                              </span>
                            </div>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                              <div
                                className="h-full rounded-full bg-indigo-500"
                                style={{
                                  width: `${Math.min(
                                    Math.round((p.used / p.totalSessions) * 100),
                                    100,
                                  )}%`,
                                }}
                              />
                            </div>
                            {p.debt > 0 ? (
                              <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">
                                To&apos;lanmagan qism: {money(p.debt)}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </div>

                <Card title="Davomat tarixi" subtitle="oxirgi 10 mashg'ulot" className="mt-5">
                  {history.length === 0 ? (
                    <Empty>Hali mashg&apos;ulot bo&apos;lmagan.</Empty>
                  ) : (
                    <div className="scroll-x">
                      <table className="w-full min-w-[520px]">
                        <thead className="border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className={th}>Sana</th>
                            <th className={th}>Vaqt</th>
                            <th className={th}>Yo&apos;nalish</th>
                            <th className={th}>Holat</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {history.map((s) => (
                            <tr key={s.id}>
                              <td className={`${td} tabular-nums`}>{dateShort(s.startsAt)}</td>
                              <td className={`${td} tabular-nums`}>{timeUz(s.startsAt)}</td>
                              <td className={td}>
                                {SPECIALIZATIONS[s.specialist.specialization as Specialization]}
                              </td>
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

                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  {child.branch.name}
                  {child.branch.address ? ` · ${child.branch.address}` : ""}
                  {child.branch.phone ? ` · ${child.branch.phone}` : ""}
                </p>
              </section>
            );
          }),
        )}
      </div>
    </>
  );
}

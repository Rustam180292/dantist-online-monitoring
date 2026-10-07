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
import { dateShort, timeUz } from "@/lib/format";
import { Badge, Card, Empty, PageHeader, StatCard, td, th } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

export default async function MyChildrenPage() {
  const user = await requireUser();
  const t = await getT();
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
        <PageHeader title={t("Farzandim")} />
        <Card>
          <Empty>
            {t("Hisobingizga farzand bog'lanmagan. Iltimos, markaz administratoriga murojaat qiling.")}
          </Empty>
        </Card>
      </>
    );
  }

  const now = new Date();

  return (
    <>
      <PageHeader
        title={t("Farzandim")}
        subtitle={t("Mashg'ulotlar jadvali, davomat va abonement holati")}
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
                    {t.age(child.birthDate)} · {child.branch.name}
                  </span>
                </h2>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {/* Kunlik to'laydigan bolada abonement tushunchasi yo'q */}
                  {child.billingType === "PACKAGE" ? (
                    <StatCard
                      label={t("Qolgan seans")}
                      value={String(remaining)}
                      tone={remaining <= 2 ? "warn" : "good"}
                    />
                  ) : (
                    <StatCard label={t("To'lov turi")} value="Kunlik" hint={t("har kelganida")} />
                  )}
                  <StatCard label={t("Jami o'tgan mashg'ulot")} value={String(doneAll)} />
                  <StatCard
                    label={t("Qarzdorlik")}
                    value={debt > 0 ? t.money(debt) : t("yo'q")}
                    tone={debt > 0 ? "bad" : "good"}
                  />
                  <StatCard
                    label={t("Mutaxassislar")}
                    value={String(child.specialists.length)}
                    hint={child.specialists
                      .map((a) => t(SPECIALIZATIONS[a.specialist.specialization as Specialization]))
                      .join(", ")}
                  />
                </div>

                <div className="mt-4 grid gap-5 xl:grid-cols-2">
                  <Card title={t("Keyingi mashg'ulotlar")}>
                    {upcoming.length === 0 ? (
                      <Empty>{t("Rejada mashg'ulot yo'q.")}</Empty>
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
                                {t(SPECIALIZATIONS[s.specialist.specialization as Specialization])}
                              </p>
                              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                {s.specialist.user.fullName} · {t.weekday(s.startsAt)} ·{" "}
                                {t("{n} daqiqa", { n: s.durationMin })}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>

                  <Card title={t("Abonement holati")}>
                    {packages.length === 0 ? (
                      <Empty>{t("Abonement yo'q.")}</Empty>
                    ) : (
                      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {packages.map((p) => (
                          <li key={p.id} className="px-4 py-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                {t(SPECIALIZATIONS[p.specialization as Specialization])}
                              </span>
                              <span className="text-sm tabular-nums text-slate-600 dark:text-slate-400">
                                {t("{left} / {total} qoldi", { left: p.remaining, total: p.totalSessions })}
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
                                {t("To'lanmagan qism:")} {t.money(p.debt)}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </div>

                <Card title={t("Davomat tarixi")} subtitle={t("oxirgi 10 mashg'ulot")} className="mt-5">
                  {history.length === 0 ? (
                    <Empty>{t("Hali mashg'ulot bo'lmagan.")}</Empty>
                  ) : (
                    <div className="scroll-x">
                      <table className="w-full min-w-[520px]">
                        <thead className="border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className={th}>{t("Sana")}</th>
                            <th className={th}>{t("Vaqt")}</th>
                            <th className={th}>{t("Yo'nalish")}</th>
                            <th className={th}>{t("Holat")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {history.map((s) => (
                            <tr key={s.id}>
                              <td className={`${td} tabular-nums`}>{dateShort(s.startsAt)}</td>
                              <td className={`${td} tabular-nums`}>{timeUz(s.startsAt)}</td>
                              <td className={td}>
                                {t(SPECIALIZATIONS[s.specialist.specialization as Specialization])}
                              </td>
                              <td className={td}>
                                <Badge className={SESSION_STATUS_STYLE[s.status as SessionStatus]}>
                                  {t(SESSION_STATUSES[s.status as SessionStatus])}
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

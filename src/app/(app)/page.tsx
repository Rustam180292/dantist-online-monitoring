import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, branchWhere } from "@/lib/auth";
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
  getBranchReport,
  getClientAlerts,
  getOverview,
  getSpecialistRows,
  monthRange,
} from "@/lib/stats";
import { num, timeUz } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { Badge, Card, PageHeader, StatCard } from "@/components/ui";
import { DataTable } from "@/components/data-table";

export default async function DashboardPage() {
  const user = await requireUser();
  // Mutaxassis va ota-ona uchun telefon kabineti qulayroq — katta jadvallar
  // ularga kerak emas. "To'liq ko'rinish" havolasi orqali bu yerga qaytishadi.
  if (user.role === "SPECIALIST" || user.role === "PARENT") redirect("/m");
  // Qabulxona xodimiga foyda va maosh ko'rsatkichlari kerak emas — uning ishi jadvalda
  if (user.role === "RECEPTION") redirect("/schedule");

  const t = await getT();
  const money = t.money;
  const branchId = user.role === "OWNER" ? null : user.branchId;
  const month = monthRange();
  const today = dayRange();

  const [
    overview,
    todaySessions,
    activeClients,
    specialistRows,
    alerts,
    branchReport,
    noTelegram,
  ] = await Promise.all([
    getOverview({ branchId, ...month }),
    prisma.session.findMany({
      where: {
        startsAt: { gte: today.from, lt: today.to },
        ...branchWhere(branchId),
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
        ...branchWhere(branchId),
      },
    }),
    getSpecialistRows({ branchId, ...month }),
    getClientAlerts({ branchId }),
    // Filiallar kesimi faqat egaga kerak: filial admini bitta filialni ko'radi
    user.role === "OWNER" ? getBranchReport(month) : Promise.resolve([]),
    // Botga ulanmagan ota-onaga eslatma bormaydi, lekin bu hech qayerda
    // bilinmaydi — xodim "yubordik" deb o'ylab yuradi. Shuning uchun sonini
    // bosh panelda ko'rsatamiz.
    prisma.client.count({
      where: {
        status: "ACTIVE",
        ...branchWhere(branchId),
        OR: [{ parentUserId: null }, { parent: { is: { telegramId: null } } }],
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        title={t("Assalomu alaykum, {name}!", { name: user.fullName.split(" ")[0] })}
        subtitle={t("{month} · {branch} bo'yicha ko'rsatkichlar", {
          month: t.monthYear(new Date()),
          branch: user.branchName ?? t("barcha filiallar"),
        })}
      />

      {noTelegram > 0 ? (
        <Link
          href="/clients?tg=yoq"
          className="mb-4 block rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 transition hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
        >
          <b>{t("{n} ta faol mijozning", { n: noTelegram })}</b>{" "}
          {t("ota-onasi Telegram botga ulanmagan — ularga eslatma bormaydi. Ro'yxatni ko'rish →")}
        </Link>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t("Faol mijozlar")}
          value={num(activeClients)}
          hint={branchId ? t("bu filialda") : t("barcha filiallarda")}
        />
        <StatCard
          label={t("O'tgan seanslar")}
          value={num(overview.done)}
          hint={t("{n} ta rejada", { n: overview.planned })}
          tone="good"
        />
        <StatCard
          label={t("Davomat")}
          value={overview.attendanceRate === null ? "—" : `${overview.attendanceRate}%`}
          hint={t("{n} ta kelmadi", { n: overview.noShow })}
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
          label={t("Kassaga tushgan")}
          value={money(overview.collected)}
          hint={t("xizmat qiymati {sum}", { sum: money(overview.earned) })}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={t("Xizmat qiymati")} value={money(overview.earned)} hint={t("o'tgan seanslar")} />
          <StatCard
            label={t("Mutaxassis haqi")}
            value={money(overview.salary)}
            hint={t("hisoblangan")}
            tone="warn"
          />
          <StatCard
            label={t("Markaz ulushi")}
            value={money(overview.earned - overview.salary)}
            hint={t("xizmat qiymati − ish haqi")}
            tone="good"
          />
          <StatCard
            label={t("Qarzdorlik")}
            value={money(alerts.debtors.reduce((s, d) => s + d.debt, 0))}
            hint={t("{n} ta abonement", { n: alerts.debtors.length })}
            tone={alerts.debtors.length ? "bad" : "default"}
          href="/payments"
        />
      </div>

      {branchReport.length > 1 ? (
        <Card
          title={t("Filiallar bo'yicha (shu oy)")}
          subtitle={t("har bir filialning mijozi, bajarilgan ishi va puli")}
          className="mt-6"
          action={
            <Link href="/reports" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              {t("Batafsil hisobot →")}
            </Link>
          }
        >
          <DataTable
            testId="dash-branches"
            columns={[
              { label: t("Filial") },
              { label: t("Faol mijoz"), className: "tabular-nums" },
              { label: t("O'tgan seans"), className: "tabular-nums" },
              { label: t("Xizmat qiymati"), className: "tabular-nums" },
              { label: t("Kassaga tushgan"), className: "tabular-nums" },
            ]}
            rows={branchReport.map((b) => ({
              key: b.id,
              search: b.name,
              sort: [b.name, b.clients, b.done, b.earned, b.collected],
              cells: [
                <span key="n" className="font-medium text-slate-800 dark:text-slate-200">{b.name}</span>,
                num(b.clients),
                num(b.done),
                money(b.earned),
                <span key="c" className="font-semibold">{money(b.collected)}</span>,
              ],
            }))}
            footer={[
              t("Jami"),
              num(branchReport.reduce((n, b) => n + b.clients, 0)),
              num(branchReport.reduce((n, b) => n + b.done, 0)),
              money(branchReport.reduce((n, b) => n + b.earned, 0)),
              money(branchReport.reduce((n, b) => n + b.collected, 0)),
            ]}
          />
        </Card>
      ) : null}

      <div className="mt-6 grid gap-5 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title={t("Bugungi jadval")}
          subtitle={t("{n} ta seans", { n: todaySessions.length })}
          action={
            <Link href="/schedule" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              {t("Butun hafta →")}
            </Link>
          }
        >
          <DataTable
            testId="dash-today"
            minWidth="min-w-[640px]"
            empty={t("Bugunga seans belgilanmagan.")}
            columns={[
              { label: t("Vaqt"), className: "font-semibold tabular-nums" },
              { label: t("Mijoz") },
              { label: t("Mutaxassis") },
              ...(!branchId ? [{ label: t("Filial") }] : []),
              { label: t("Holat") },
            ]}
            rows={todaySessions.map((s) => {
              const spec = t(SPECIALIZATIONS[s.specialist.specialization as Specialization]);
              const status = t(SESSION_STATUSES[s.status as SessionStatus]);
              return {
                key: s.id,
                search: [s.client.fullName, s.specialist.user.fullName, spec, s.branch.name, status].join(" "),
                sort: [
                  s.startsAt.getTime(),
                  s.client.fullName,
                  s.specialist.user.fullName,
                  ...(!branchId ? [s.branch.name] : []),
                  status,
                ],
                cells: [
                  timeUz(s.startsAt),
                  <Link
                    key="c"
                    href={`/clients/${s.client.id}`}
                    className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    {s.client.fullName}
                  </Link>,
                  <span key="s">
                    {s.specialist.user.fullName}
                    <span className="block text-xs text-slate-400">{spec}</span>
                  </span>,
                  ...(!branchId ? [s.branch.name] : []),
                  <Badge key="b" className={SESSION_STATUS_STYLE[s.status as SessionStatus]}>
                    {status}
                  </Badge>,
                ],
              };
            })}
          />
        </Card>

        <div className="space-y-5">
          <Card title={t("Abonementi tugayotganlar")} subtitle={t("2 va kamroq seans qolgan")}>
            <DataTable
              testId="dash-ending"
              minWidth=""
              empty={t("Hammasining abonementi yetarli.")}
              columns={[{ label: t("Mijoz") }, { label: t("Qolgan") }]}
              rows={alerts.ending.map((a) => {
                const spec = t(SPECIALIZATIONS[a.specialization as Specialization]);
                return {
                  key: a.packageId,
                  search: `${a.clientName} ${spec}`,
                  sort: [a.clientName, a.remaining],
                  cells: [
                    <span key="c" className="block min-w-0">
                      <Link
                        href={`/clients/${a.clientId}`}
                        className="block truncate text-sm font-medium text-slate-800 hover:underline dark:text-slate-200"
                      >
                        {a.clientName}
                      </Link>
                      <span className="block truncate text-xs text-slate-400">{spec}</span>
                    </span>,
                    <Badge
                      key="r"
                      className={
                        a.remaining === 0
                          ? "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-900"
                          : "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900"
                      }
                    >
                      {t("{n} seans", { n: a.remaining })}
                    </Badge>,
                  ],
                };
              })}
            />
          </Card>

        </div>
      </div>

      {/* To'liq kenglikda: tor ustunda ish haqi ustuni sig'may, kesilib qolardi */}
      <Card
        title={t("Mutaxassislar")}
        subtitle={t("{month} natijalari", { month: t.monthYear(new Date()) })}
        className="mt-5"
      >
        <DataTable
          testId="dash-specialists"
          empty={t("Mutaxassis qo'shilmagan.")}
          columns={[
            { label: t("Mutaxassis") },
            { label: t("Yo'nalish") },
            ...(!branchId ? [{ label: t("Filial") }] : []),
            { label: t("Mijoz"), className: "tabular-nums" },
            { label: t("O'tdi"), className: "tabular-nums" },
            { label: t("Ish haqi"), className: "tabular-nums" },
          ]}
          rows={specialistRows.map((sp) => {
            const spec = t(SPECIALIZATIONS[sp.specialization as Specialization]);
            return {
              key: sp.id,
              search: `${sp.fullName} ${spec} ${sp.branchName}`,
              sort: [
                sp.fullName,
                spec,
                ...(!branchId ? [sp.branchName] : []),
                sp.clients,
                sp.done,
                sp.salary,
              ],
              cells: [
                <span key="n" className="font-medium text-slate-800 dark:text-slate-200">{sp.fullName}</span>,
                spec,
                ...(!branchId ? [sp.branchName] : []),
                sp.clients,
                sp.done,
                <span key="s" className="font-semibold">{money(sp.salary)}</span>,
              ],
            };
          })}
        />
      </Card>
    </>
  );
}
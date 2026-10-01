import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  BILLABLE_STATUSES,
  SESSION_STATUSES,
  SPECIALIZATIONS,
  type SessionStatus,
  type Specialization,
} from "@/lib/constants";
import { addDays, getSpecialistEarnings, monthRange, startOfDay } from "@/lib/stats";
import { dateShort, money, monthYearUz, timeUz, weekdayShortUz } from "@/lib/format";
import { setSessionStatus } from "@/app/(app)/schedule/actions";

type Tab = "today" | "week" | "clients" | "money";
const TABS: { key: Tab; label: string }[] = [
  { key: "today", label: "Bugun" },
  { key: "week", label: "Hafta" },
  { key: "clients", label: "Mijozlarim" },
  { key: "money", label: "Pulim" },
];

export default async function MiniAppPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/tg");

  const { tab: tabRaw } = await searchParams;
  const tab: Tab = (TABS.find((t) => t.key === tabRaw)?.key ?? "today") as Tab;

  /* --- Ota-ona va adminlar uchun hozircha qisqa ko'rinish --- */
  if (user.role !== "SPECIALIST") {
    const target = user.role === "PARENT" ? "/my" : "/";
    const title = user.role === "PARENT" ? "Ota-ona kabineti" : "Boshqaruv paneli";
    return (
      <main className="mx-auto max-w-md px-4 py-8">
        <div className="tg-card p-5 text-center">
          <p className="text-base font-bold">Assalomu alaykum, {user.fullName}!</p>
          <p className="mt-2 text-sm tg-muted">
            {user.role === "PARENT"
              ? "Telegram kabinetingiz tayyorlanmoqda. Hozircha quyidagi tugma orqali to'liq ko'rinishga o'ting."
              : "Katta jadval va hisobotlar uchun to'liq panel qulayroq."}
          </p>
          <Link
            href={target}
            className="tg-accent mt-4 inline-block rounded-xl px-4 py-2.5 text-sm font-semibold"
          >
            {title}ni ochish
          </Link>
        </div>
      </main>
    );
  }

  /* --- Mutaxassis kabineti --- */
  const specialistId = user.specialistId!;
  const todayFrom = startOfDay();
  const todayTo = addDays(todayFrom, 1);
  const weekTo = addDays(todayFrom, 7);
  const month = monthRange();

  const earnings = await getSpecialistEarnings(specialistId);

  return (
    <main className="mx-auto max-w-md px-4 pb-10 pt-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-bold">{user.fullName}</p>
          <p className="truncate text-xs tg-muted">
            {SPECIALIZATIONS[user.specialization as Specialization]}
            {user.branchName ? ` · ${user.branchName}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs tg-muted">Qolgan pulim</p>
          <p className="text-base font-bold tabular-nums">{money(earnings.balance)}</p>
        </div>
      </header>

      <nav className="mb-4 flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/tg/app?tab=${t.key}`}
            className={`shrink-0 rounded-xl px-3 py-1.5 text-sm font-medium ${
              t.key === tab ? "tg-accent" : "tg-card tg-muted"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "today" ? (
        <SessionList
          specialistId={specialistId}
          from={todayFrom}
          to={todayTo}
          emptyText="Bugunga seans belgilanmagan."
          showDate={false}
        />
      ) : null}

      {tab === "week" ? (
        <SessionList
          specialistId={specialistId}
          from={todayFrom}
          to={weekTo}
          emptyText="Yaqin 7 kunda seans yo'q."
          showDate
        />
      ) : null}

      {tab === "clients" ? <MyClients specialistId={specialistId} /> : null}

      {tab === "money" ? (
        <MyMoney specialistId={specialistId} monthFrom={month.from} monthTo={month.to} />
      ) : null}
    </main>
  );
}

/* ---------------- Seanslar ro'yxati ---------------- */

async function SessionList({
  specialistId,
  from,
  to,
  emptyText,
  showDate,
}: {
  specialistId: string;
  from: Date;
  to: Date;
  emptyText: string;
  showDate: boolean;
}) {
  const sessions = await prisma.session.findMany({
    where: { specialistId, startsAt: { gte: from, lt: to } },
    orderBy: { startsAt: "asc" },
    include: { client: { select: { id: true, fullName: true } } },
  });

  if (sessions.length === 0) {
    return <p className="tg-card px-4 py-8 text-center text-sm tg-muted">{emptyText}</p>;
  }

  return (
    <ul className="space-y-2">
      {sessions.map((s) => (
        <li key={s.id} className="tg-card p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{s.client.fullName}</p>
              <p className="text-xs tg-muted">
                {showDate ? `${weekdayShortUz(s.startsAt)}, ${dateShort(s.startsAt)} · ` : ""}
                {timeUz(s.startsAt)} · {s.durationMin} daq.
              </p>
            </div>
            <span
              className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-medium ${
                s.status === "DONE"
                  ? "bg-emerald-100 text-emerald-700"
                  : s.status === "NO_SHOW"
                    ? "bg-rose-100 text-rose-700"
                    : s.status === "PLANNED"
                      ? "bg-slate-200 text-slate-700"
                      : "bg-amber-100 text-amber-700"
              }`}
            >
              {SESSION_STATUSES[s.status as SessionStatus]}
            </span>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {s.status === "PLANNED" ? (
              <>
                <MarkButton id={s.id} status="DONE" label="O'tdi" tone="good" />
                <MarkButton id={s.id} status="NO_SHOW" label="Kelmadi" tone="bad" />
                <MarkButton id={s.id} status="CANCELLED_CLIENT" label="Bekor" tone="warn" />
              </>
            ) : (
              <MarkButton id={s.id} status="PLANNED" label="Qaytarish" tone="plain" />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function MarkButton({
  id,
  status,
  label,
  tone,
}: {
  id: string;
  status: SessionStatus;
  label: string;
  tone: "good" | "bad" | "warn" | "plain";
}) {
  const tones = {
    good: "bg-emerald-600 text-white",
    bad: "bg-rose-600 text-white",
    warn: "bg-amber-500 text-white",
    plain: "bg-slate-200 text-slate-700",
  };
  return (
    <form action={setSessionStatus}>
      <input type="hidden" name="sessionId" value={id} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tones[tone]}`}
      >
        {label}
      </button>
    </form>
  );
}

/* ---------------- Mijozlarim ---------------- */

async function MyClients({ specialistId }: { specialistId: string }) {
  const specialist = await prisma.specialist.findUniqueOrThrow({
    where: { id: specialistId },
    select: { specialization: true },
  });

  const assignments = await prisma.assignment.findMany({
    where: { specialistId },
    include: {
      client: {
        select: {
          id: true,
          fullName: true,
          parentPhone: true,
          status: true,
          packages: {
            where: { specialization: specialist.specialization, isActive: true },
            select: { totalSessions: true, sessions: { select: { status: true } } },
          },
          sessions: {
            where: { specialistId, startsAt: { gte: new Date() }, status: "PLANNED" },
            orderBy: { startsAt: "asc" },
            take: 1,
            select: { startsAt: true },
          },
        },
      },
    },
  });

  if (assignments.length === 0) {
    return <p className="tg-card px-4 py-8 text-center text-sm tg-muted">Mijoz biriktirilmagan.</p>;
  }

  const rows = assignments
    .map((a) => {
      const remaining = a.client.packages.reduce((sum, p) => {
        const used = p.sessions.filter((s) =>
          BILLABLE_STATUSES.includes(s.status as SessionStatus),
        ).length;
        return sum + Math.max(p.totalSessions - used, 0);
      }, 0);
      return {
        id: a.client.id,
        name: a.client.fullName,
        phone: a.client.parentPhone,
        status: a.client.status,
        remaining,
        next: a.client.sessions[0]?.startsAt ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <ul className="space-y-2">
      {rows.map((c) => (
        <li key={c.id} className="tg-card p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {c.name}
                {c.status !== "ACTIVE" ? (
                  <span className="ml-1.5 text-xs font-normal tg-muted">(to&apos;xtatilgan)</span>
                ) : null}
              </p>
              <p className="text-xs tg-muted">
                {c.next
                  ? `Keyingi: ${weekdayShortUz(c.next)}, ${dateShort(c.next)} ${timeUz(c.next)}`
                  : "Keyingi seans belgilanmagan"}
              </p>
              <a href={`tel:${c.phone}`} className="tg-link text-xs">
                {c.phone}
              </a>
            </div>
            <span
              className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-semibold tabular-nums ${
                c.remaining === 0
                  ? "bg-rose-100 text-rose-700"
                  : c.remaining <= 2
                    ? "bg-amber-100 text-amber-700"
                    : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {c.remaining} seans
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- Pulim ---------------- */

async function MyMoney({
  specialistId,
  monthFrom,
  monthTo,
}: {
  specialistId: string;
  monthFrom: Date;
  monthTo: Date;
}) {
  const [earnings, sessions, payouts, specialist] = await Promise.all([
    getSpecialistEarnings(specialistId),
    prisma.session.findMany({
      where: {
        specialistId,
        startsAt: { gte: monthFrom, lt: monthTo },
        status: { in: ["DONE", "NO_SHOW"] },
      },
      orderBy: { startsAt: "desc" },
      include: { client: { select: { fullName: true } } },
    }),
    prisma.salaryPayout.findMany({
      where: { specialistId },
      orderBy: { paidAt: "desc" },
      take: 10,
    }),
    prisma.specialist.findUnique({
      where: { id: specialistId },
      select: { salaryPercent: true },
    }),
  ]);

  const percent = specialist?.salaryPercent ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Qolgan (olishim kerak)" value={money(earnings.balance)} strong />
        <Stat label={`${monthYearUz(monthFrom)}da hisoblangan`} value={money(earnings.accruedMonth)} />
        <Stat label="Jami hisoblangan" value={money(earnings.accruedTotal)} />
        <Stat label="Jami to'langan" value={money(earnings.paidTotal)} />
      </div>

      <section className="tg-card p-3">
        <p className="mb-2 text-sm font-semibold">
          {monthYearUz(monthFrom)} seanslari{" "}
          <span className="font-normal tg-muted">· ulushim {percent}%</span>
        </p>
        {sessions.length === 0 ? (
          <p className="py-4 text-center text-sm tg-muted">Bu oyda hisobga kirgan seans yo&apos;q.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm">{s.client.fullName}</p>
                  <p className="text-xs tg-muted">
                    {dateShort(s.startsAt)} · {SESSION_STATUSES[s.status as SessionStatus]}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {money(Math.round((s.price * (s.salaryPercent ?? percent)) / 100))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="tg-card p-3">
        <p className="mb-2 text-sm font-semibold">Qo&apos;lga tekkan to&apos;lovlar</p>
        {payouts.length === 0 ? (
          <p className="py-4 text-center text-sm tg-muted">Hali to&apos;lov yozilmagan.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {payouts.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="text-sm tabular-nums">{dateShort(p.paidAt)}</p>
                  {p.note ? <p className="truncate text-xs tg-muted">{p.note}</p> : null}
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {money(p.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="tg-card p-3">
      <p className="text-xs tg-muted">{label}</p>
      <p className={`mt-1 tabular-nums ${strong ? "text-lg font-bold" : "text-base font-semibold"}`}>
        {value}
      </p>
    </div>
  );
}

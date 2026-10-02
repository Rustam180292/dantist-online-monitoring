import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  SESSION_STATUSES,
  SPECIALIZATIONS,
  type SessionStatus,
  type Specialization,
} from "@/lib/constants";
import { getClientPackages } from "@/lib/stats";
import { ageUz, dateShort, money, timeUz, weekdayUz } from "@/lib/format";

type ParentTab = "schedule" | "history" | "billing";

const TABS: { key: ParentTab; label: string }[] = [
  { key: "schedule", label: "Jadval" },
  { key: "history", label: "Davomat" },
  { key: "billing", label: "Abonement" },
];

export async function ParentApp({
  userId,
  tab: tabRaw,
  childId: childRaw,
}: {
  userId: string;
  tab?: string;
  childId?: string;
}) {
  const tab: ParentTab = (TABS.find((t) => t.key === tabRaw)?.key ?? "schedule") as ParentTab;

  const children = await prisma.client.findMany({
    where: { parentUserId: userId },
    orderBy: { fullName: "asc" },
    include: { branch: { select: { name: true, address: true, phone: true } } },
  });

  if (children.length === 0) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <div className="app-card p-5 text-center">
          <p className="text-base font-bold">Farzand biriktirilmagan</p>
          <p className="mt-2 text-sm app-muted">
            Hisobingizga farzandingiz bog&apos;lanmagan. Iltimos, markaz administratoriga
            murojaat qiling.
          </p>
        </div>
      </main>
    );
  }

  const child = children.find((c) => c.id === childRaw) ?? children[0];
  const now = new Date();

  const [upcoming, history, packages] = await Promise.all([
    prisma.session.findMany({
      where: { clientId: child.id, startsAt: { gte: now }, status: "PLANNED" },
      orderBy: { startsAt: "asc" },
      take: 10,
      include: { specialist: { include: { user: { select: { fullName: true } } } } },
    }),
    prisma.session.findMany({
      where: { clientId: child.id, startsAt: { lt: now } },
      orderBy: { startsAt: "desc" },
      take: 15,
      include: { specialist: { include: { user: { select: { fullName: true } } } } },
    }),
    getClientPackages(child.id),
  ]);

  const remaining = packages.reduce((s, p) => s + (p.isActive ? p.remaining : 0), 0);
  const debt = packages.reduce((s, p) => s + p.debt, 0);
  const next = upcoming[0] ?? null;

  const link = (params: Record<string, string>) => {
    const p = new URLSearchParams({ child: child.id, tab, ...params });
    return `/m?${p.toString()}`;
  };

  return (
    <main className="mx-auto max-w-md px-4 pb-10 pt-4">
      <header className="mb-3">
        <p className="text-base font-bold">{child.fullName}</p>
        <p className="text-xs app-muted">
          {ageUz(child.birthDate)} · {child.branch.name}
        </p>
      </header>

      {children.length > 1 ? (
        <nav className="mb-3 flex gap-1 overflow-x-auto">
          {children.map((c) => (
            <Link
              key={c.id}
              href={`/m?child=${c.id}&tab=${tab}`}
              className={`shrink-0 rounded-xl px-3 py-1.5 text-sm font-medium ${
                c.id === child.id ? "app-accent" : "app-card app-muted"
              }`}
            >
              {c.fullName.split(" ")[0]}
            </Link>
          ))}
        </nav>
      ) : null}

      {/* Keyingi mashg'ulot — eng kerakli ma'lumot yuqorida */}
      <section className="app-card mb-3 p-4">
        <p className="text-xs app-muted">Keyingi mashg&apos;ulot</p>
        {next ? (
          <>
            <p className="mt-1 text-lg font-bold">
              {weekdayUz(next.startsAt)}, {timeUz(next.startsAt)}
            </p>
            <p className="text-sm">
              {dateShort(next.startsAt)} ·{" "}
              {SPECIALIZATIONS[next.specialist.specialization as Specialization]}
            </p>
            <p className="text-xs app-muted">
              {next.specialist.user.fullName} · {next.durationMin} daqiqa
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm app-muted">Rejada mashg&apos;ulot yo&apos;q.</p>
        )}
      </section>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="app-card p-3">
          <p className="text-xs app-muted">Qolgan seans</p>
          <p
            className={`mt-1 text-lg font-bold tabular-nums ${
              remaining === 0 ? "text-rose-600" : remaining <= 2 ? "text-amber-600" : ""
            }`}
          >
            {remaining}
          </p>
        </div>
        <div className="app-card p-3">
          <p className="text-xs app-muted">Qarzdorlik</p>
          <p
            className={`mt-1 text-lg font-bold tabular-nums ${debt > 0 ? "text-rose-600" : ""}`}
          >
            {debt > 0 ? money(debt) : "yo'q"}
          </p>
        </div>
      </div>

      <nav className="mb-3 flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/m?child=${child.id}&tab=${t.key}`}
            className={`shrink-0 rounded-xl px-3 py-1.5 text-sm font-medium ${
              t.key === tab ? "app-accent" : "app-card app-muted"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "schedule" ? (
        upcoming.length === 0 ? (
          <p className="app-card px-4 py-8 text-center text-sm app-muted">
            Rejada mashg&apos;ulot yo&apos;q.
          </p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((s) => (
              <li key={s.id} className="app-card flex items-center gap-3 p-3">
                <div className="w-16 shrink-0">
                  <p className="text-sm font-bold tabular-nums">{timeUz(s.startsAt)}</p>
                  <p className="text-xs app-muted">{dateShort(s.startsAt)}</p>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {SPECIALIZATIONS[s.specialist.specialization as Specialization]}
                  </p>
                  <p className="truncate text-xs app-muted">
                    {s.specialist.user.fullName} · {weekdayUz(s.startsAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === "history" ? (
        history.length === 0 ? (
          <p className="app-card px-4 py-8 text-center text-sm app-muted">
            Hali mashg&apos;ulot bo&apos;lmagan.
          </p>
        ) : (
          <ul className="space-y-2">
            {history.map((s) => (
              <li key={s.id} className="app-card flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {SPECIALIZATIONS[s.specialist.specialization as Specialization]}
                  </p>
                  <p className="text-xs app-muted">
                    {dateShort(s.startsAt)} {timeUz(s.startsAt)} · {s.specialist.user.fullName}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-medium ${
                    s.status === "DONE"
                      ? "bg-emerald-100 text-emerald-700"
                      : s.status === "NO_SHOW"
                        ? "bg-rose-100 text-rose-700"
                        : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {SESSION_STATUSES[s.status as SessionStatus]}
                </span>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === "billing" ? (
        <div className="space-y-2">
          {packages.length === 0 ? (
            <p className="app-card px-4 py-8 text-center text-sm app-muted">Abonement yo&apos;q.</p>
          ) : (
            packages.map((p) => (
              <section key={p.id} className="app-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {SPECIALIZATIONS[p.specialization as Specialization]}
                  </p>
                  <p className="text-sm tabular-nums app-muted">
                    {p.remaining} / {p.totalSessions} qoldi
                  </p>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10">
                  <div
                    className="h-full rounded-full bg-indigo-500"
                    style={{
                      width: `${Math.min(Math.round((p.used / p.totalSessions) * 100), 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-1.5 text-xs app-muted">
                  Seans narxi {money(p.pricePerSession)} · jami {money(p.cost)} · to&apos;langan{" "}
                  {money(p.paid)}
                  {p.expiresAt ? ` · ${dateShort(p.expiresAt)} gacha` : ""}
                </p>
                {p.debt > 0 ? (
                  <p className="mt-1 text-xs font-semibold text-rose-600">
                    To&apos;lanmagan: {money(p.debt)}
                  </p>
                ) : null}
              </section>
            ))
          )}
        </div>
      ) : null}

      <footer className="mt-4 app-card p-3 text-xs app-muted">
        <p className="font-semibold">{child.branch.name}</p>
        {child.branch.address ? <p>{child.branch.address}</p> : null}
        {child.branch.phone ? (
          <a href={`tel:${child.branch.phone}`} className="app-link">
            {child.branch.phone}
          </a>
        ) : null}
      </footer>
    </main>
  );
}

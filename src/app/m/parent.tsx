import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  PARENT_CANCEL_MIN_HOURS,
  PAYMENT_METHODS,
  SESSION_STATUSES,
  SPECIALIZATIONS,
  type PaymentMethod,
  type SessionStatus,
  type Specialization,
} from "@/lib/constants";
import { cancelByParent } from "./parent-actions";
import { TgLink } from "./tg-link";
import { getClientPackages } from "@/lib/stats";
import { dateShort, timeUz } from "@/lib/format";
import { getT } from "@/lib/i18n/server";

type ParentTab = "schedule" | "history" | "payments" | "billing" | "team";

const TABS: { key: ParentTab; label: string }[] = [
  { key: "schedule", label: "Jadval" },
  { key: "history", label: "Davomat" },
  { key: "payments", label: "To'lovlar" },
  { key: "billing", label: "Abonement" },
  { key: "team", label: "Mutaxassislar" },
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
  const t = await getT();
  const money = t.money;
  const tab: ParentTab = (TABS.find((x) => x.key === tabRaw)?.key ?? "schedule") as ParentTab;

  const children = await prisma.client.findMany({
    where: { parentUserId: userId },
    orderBy: { fullName: "asc" },
    include: { branch: { select: { name: true, address: true, phone: true } } },
  });

  if (children.length === 0) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <div className="app-card p-5 text-center">
          <p className="text-base font-bold">{t("Farzand biriktirilmagan")}</p>
          <p className="mt-2 text-sm app-muted">
            {t("Hisobingizga farzandingiz bog'lanmagan. Iltimos, markaz administratoriga murojaat qiling.")}
          </p>
        </div>
      </main>
    );
  }

  const child = children.find((c) => c.id === childRaw) ?? children[0];
  const now = new Date();

  const [upcoming, history, packages, payments, team] = await Promise.all([
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
    tab === "payments"
      ? prisma.payment.findMany({
          where: { clientId: child.id },
          orderBy: { paidAt: "desc" },
          take: 50,
          include: { package: { select: { specialization: true } } },
        })
      : Promise.resolve([]),
    tab === "team"
      ? prisma.assignment.findMany({
          where: { clientId: child.id, specialist: { isActive: true } },
          orderBy: { createdAt: "asc" },
          include: {
            specialist: {
              include: {
                user: { select: { fullName: true, phone: true, telegramUsername: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);
  const cancelDeadline = new Date(now.getTime() + PARENT_CANCEL_MIN_HOURS * 3_600_000);

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
          {t.age(child.birthDate)} · {child.branch.name}
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
        <p className="text-xs app-muted">{t("Keyingi mashg'ulot")}</p>
        {next ? (
          <>
            <p className="mt-1 text-lg font-bold">
              {t.weekday(next.startsAt)}, {timeUz(next.startsAt)}
            </p>
            <p className="text-sm">
              {dateShort(next.startsAt)} ·{" "}
              {t(SPECIALIZATIONS[next.specialist.specialization as Specialization])}
            </p>
            <p className="text-xs app-muted">
              {next.specialist.user.fullName} · {t("{n} daqiqa", { n: next.durationMin })}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm app-muted">{t("Rejada mashg'ulot yo'q.")}</p>
        )}
      </section>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="app-card p-3">
          <p className="text-xs app-muted">{t("Qolgan seans")}</p>
          {/* Kunlik to'laydigan bolada abonement yo'q — "0 seans qoldi" deb
              qizartirib qo'yish ota-onani bekorga xavotirga soladi */}
          {child.billingType === "PACKAGE" ? (
            <p
              className={`mt-1 text-lg font-bold tabular-nums ${
                remaining === 0 ? "text-rose-600" : remaining <= 2 ? "text-amber-600" : ""
              }`}
            >
              {remaining}
            </p>
          ) : (
            <p className="mt-1 text-lg font-bold app-muted">{t("kunlik")}</p>
          )}
        </div>
        <div className="app-card p-3">
          <p className="text-xs app-muted">{t("Qarzdorlik")}</p>
          <p
            className={`mt-1 text-lg font-bold tabular-nums ${debt > 0 ? "text-rose-600" : ""}`}
          >
            {debt > 0 ? money(debt) : t("yo'q")}
          </p>
        </div>
      </div>

      <nav className="mb-3 flex gap-1 overflow-x-auto">
        {TABS.map((x) => (
          <Link
            key={x.key}
            href={`/m?child=${child.id}&tab=${x.key}`}
            className={`shrink-0 rounded-xl px-3 py-1.5 text-sm font-medium ${
              x.key === tab ? "app-accent" : "app-card app-muted"
            }`}
          >
            {t(x.label)}
          </Link>
        ))}
      </nav>

      {tab === "schedule" ? (
        upcoming.length === 0 ? (
          <p className="app-card px-4 py-8 text-center text-sm app-muted">
            {t("Rejada mashg'ulot yo'q.")}
          </p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((s) => (
              <li key={s.id} className="app-card p-3" data-testid="parent-session">
                <div className="flex items-center gap-3">
                  <div className="w-16 shrink-0">
                    <p className="text-sm font-bold tabular-nums">{timeUz(s.startsAt)}</p>
                    <p className="text-xs app-muted">{dateShort(s.startsAt)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {t(SPECIALIZATIONS[s.specialist.specialization as Specialization])}
                    </p>
                    <p className="truncate text-xs app-muted">
                      {s.specialist.user.fullName} · {t.weekday(s.startsAt)}
                    </p>
                  </div>
                </div>
                {/* Ikki bosqichli: bitta tasodifiy bosish bilan mashg'ulot yo'qolmasin */}
                {s.startsAt >= cancelDeadline ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer select-none text-xs font-medium text-rose-600">
                      {t("Kela olmaymiz — bekor qilish")}
                    </summary>
                    <form action={cancelByParent} className="mt-2 space-y-2">
                      <input type="hidden" name="sessionId" value={s.id} />
                      <input
                        name="reason"
                        maxLength={300}
                        placeholder={t("Sababi (ixtiyoriy): kasal, safarda…")}
                        className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm"
                      />
                      <button
                        type="submit"
                        className="w-full rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white"
                      >
                        {t("Ha, mashg'ulotni bekor qilish")}
                      </button>
                    </form>
                  </details>
                ) : (
                  <p className="mt-2 text-[11px] app-muted">
                    {t("Bekor qilish uchun markazga qo'ng'iroq qiling.")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === "history" ? (
        history.length === 0 ? (
          <p className="app-card px-4 py-8 text-center text-sm app-muted">
            {t("Hali mashg'ulot bo'lmagan.")}
          </p>
        ) : (
          <ul className="space-y-2">
            {history.map((s) => (
              <li key={s.id} className="app-card flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {t(SPECIALIZATIONS[s.specialist.specialization as Specialization])}
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
                  {t(SESSION_STATUSES[s.status as SessionStatus])}
                </span>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === "billing" ? (
        <div className="space-y-2">
          {packages.length === 0 ? (
            <p className="app-card px-4 py-8 text-center text-sm app-muted">{t("Abonement yo'q.")}</p>
          ) : (
            packages.map((p) => (
              <section key={p.id} className="app-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {t(SPECIALIZATIONS[p.specialization as Specialization])}
                  </p>
                  <p className="text-sm tabular-nums app-muted">
                    {t("{left} / {total} qoldi", { left: p.remaining, total: p.totalSessions })}
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
                  {t("Seans narxi {sum}", { sum: money(p.pricePerSession) })} ·{" "}
                  {t("jami {sum}", { sum: money(p.cost) })} ·{" "}
                  {t("to'langan {sum}", { sum: money(p.paid) })}
                  {p.expiresAt ? ` · ${t("{date} gacha", { date: dateShort(p.expiresAt) })}` : ""}
                </p>
                {p.debt > 0 ? (
                  <p className="mt-1 text-xs font-semibold text-rose-600">
                    {t("To'lanmagan: {sum}", { sum: money(p.debt) })}
                  </p>
                ) : null}
              </section>
            ))
          )}
        </div>
      ) : null}

      {tab === "payments" ? (
        payments.length === 0 ? (
          <p className="app-card px-4 py-8 text-center text-sm app-muted">
            {t("Hali to'lov qilinmagan.")}
          </p>
        ) : (
          <>
            <div className="app-card mb-2 flex items-center justify-between p-3">
              <p className="text-xs app-muted">{t("Jami to'langan")}</p>
              <p className="text-base font-bold tabular-nums">
                {money(payments.reduce((sum, p) => sum + p.amount, 0))}
              </p>
            </div>
            <ul className="space-y-2">
              {payments.map((p) => (
                <li key={p.id} className="app-card flex items-center justify-between gap-3 p-3" data-testid="parent-payment">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{dateShort(p.paidAt)}</p>
                    <p className="truncate text-xs app-muted">
                      {t(PAYMENT_METHODS[p.method as PaymentMethod] ?? p.method)}
                      {p.package
                        ? ` · ${t(SPECIALIZATIONS[p.package.specialization as Specialization])}`
                        : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-bold tabular-nums text-emerald-600">
                    {money(p.amount)}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )
      ) : null}

      {tab === "team" ? (
        team.length === 0 ? (
          <p className="app-card px-4 py-8 text-center text-sm app-muted">
            {t("Mutaxassis hali biriktirilmagan.")}
          </p>
        ) : (
          <ul className="space-y-2">
            {team.map(({ specialist: sp }) => (
              <li key={sp.id} className="app-card p-3" data-testid="parent-specialist">
                <p className="text-sm font-semibold">{sp.user.fullName}</p>
                <p className="text-xs app-muted">
                  {t(SPECIALIZATIONS[sp.specialization as Specialization])}
                </p>
                <div className="mt-2.5 flex gap-2">
                  <a
                    href={`tel:${sp.user.phone}`}
                    className="app-accent flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold"
                  >
                    📞 {t("Qo'ng'iroq qilish")}
                  </a>
                  {sp.user.telegramUsername ? (
                    <TgLink
                      href={`https://t.me/${sp.user.telegramUsername}`}
                      className="app-card flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold"
                    >
                      ✈️ {t("Telegramda yozish")}
                    </TgLink>
                  ) : null}
                </div>
                <p className="mt-1.5 text-xs app-muted tabular-nums">{sp.user.phone}</p>
              </li>
            ))}
          </ul>
        )
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

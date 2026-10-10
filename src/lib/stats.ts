import { branchWhere, NOT_SOLO } from "@/lib/auth";
import "server-only";
import { prisma } from "@/lib/prisma";
import { BILLABLE_STATUSES, type SessionStatus } from "@/lib/constants";

export type Range = { from: Date; to: Date };

export function startOfDay(d: Date = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function dayRange(d: Date = new Date()): Range {
  const from = startOfDay(d);
  return { from, to: addDays(from, 1) };
}

/** Dushanbadan boshlanadigan hafta */
export function weekRange(d: Date = new Date()): Range {
  const from = startOfDay(d);
  from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
  return { from, to: addDays(from, 7) };
}

export function monthRange(d: Date = new Date()): Range {
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return { from, to };
}

const isBillable = (s: string) => BILLABLE_STATUSES.includes(s as SessionStatus);

export type Overview = {
  planned: number;
  done: number;
  noShow: number;
  cancelled: number;
  total: number;
  /** O'tgan seanslardan tushgan hisob-kitob (xizmat qiymati) */
  earned: number;
  /** Shu davrda kassaga kirgan pul */
  collected: number;
  /** Mutaxassislarga to'lanadigan ish haqi */
  salary: number;
  attendanceRate: number | null;
};

export async function getOverview(opts: {
  branchId?: string | null;
  specialistId?: string | null;
  from: Date;
  to: Date;
}): Promise<Overview> {
  const { branchId, specialistId, from, to } = opts;

  const where = {
    startsAt: { gte: from, lt: to },
    ...branchWhere(branchId),
    ...(specialistId ? { specialistId } : {}),
  };

  const [sessions, specialists, paymentAgg, intakeAgg] = await Promise.all([
    prisma.session.findMany({
      where,
      select: { status: true, price: true, specialistId: true, salaryPercent: true },
    }),
    prisma.specialist.findMany({ select: { id: true, salaryPercent: true } }),
    prisma.payment.aggregate({
      where: {
        paidAt: { gte: from, lt: to },
        ...branchWhere(branchId),
      },
      _sum: { amount: true },
    }),
    // Konsultatsiya puli ham kassaga tushadi. U Payment jadvalida emas (qabul
    // hali mijoz emas), lekin "kassaga tushgan" raqami to'liq bo'lishi kerak:
    // aks holda panel va to'lovlar sahifasidagi summalar bir-biriga mos kelmaydi.
    prisma.intake.aggregate({
      where: {
        paidAt: { gte: from, lt: to },
        ...branchWhere(branchId),
      },
      _sum: { price: true },
    }),
  ]);

  const percentOf = new Map(specialists.map((s) => [s.id, s.salaryPercent]));

  let planned = 0;
  let done = 0;
  let noShow = 0;
  let cancelled = 0;
  let earned = 0;
  let salary = 0;

  for (const s of sessions) {
    if (s.status === "PLANNED") planned++;
    else if (s.status === "DONE") done++;
    else if (s.status === "NO_SHOW") noShow++;
    else cancelled++;

    if (isBillable(s.status)) {
      earned += s.price;
      salary += Math.round(
        (s.price * (s.salaryPercent ?? percentOf.get(s.specialistId) ?? 0)) / 100,
      );
    }
  }

  const held = done + noShow + cancelled;

  return {
    planned,
    done,
    noShow,
    cancelled,
    total: sessions.length,
    earned,
    collected: specialistId
      ? 0
      : (paymentAgg._sum.amount ?? 0) + (intakeAgg._sum.price ?? 0),
    salary,
    attendanceRate: held > 0 ? Math.round((done / held) * 100) : null,
  };
}

export type BranchReportRow = {
  id: string;
  name: string;
  clients: number;
  done: number;
  earned: number;
  collected: number;
};

/**
 * Filiallar kesimidagi oylik hisobot.
 *
 * Bosh panelda ham, hisobotlar sahifasida ham kerak bo'lgani uchun shu yerda
 * turadi: ikki joyda ikki xil hisoblanib, raqamlar bir-biriga mos kelmay
 * qolmasin.
 */
export async function getBranchReport(opts: {
  from: Date;
  to: Date;
}): Promise<BranchReportRow[]> {
  const branches = await prisma.branch.findMany({ where: NOT_SOLO, orderBy: { name: "asc" } });

  return Promise.all(
    branches.map(async (b) => {
      const [ov, clients] = await Promise.all([
        getOverview({ branchId: b.id, from: opts.from, to: opts.to }),
        prisma.client.count({ where: { branchId: b.id, status: "ACTIVE" } }),
      ]);
      return {
        id: b.id,
        name: b.name,
        clients,
        done: ov.done,
        earned: ov.earned,
        collected: ov.collected,
      };
    }),
  );
}

export type SpecialistRow = {
  id: string;
  fullName: string;
  specialization: string;
  branchName: string;
  salaryPercent: number;
  clients: number;
  done: number;
  noShow: number;
  planned: number;
  revenue: number;
  salary: number;
};

export async function getSpecialistRows(opts: {
  branchId?: string | null;
  from: Date;
  to: Date;
}): Promise<SpecialistRow[]> {
  const { branchId, from, to } = opts;

  const specialists = await prisma.specialist.findMany({
    where: { ...branchWhere(branchId), isActive: true },
    include: {
      user: { select: { fullName: true } },
      branch: { select: { name: true } },
      _count: { select: { clients: true } },
      sessions: {
        where: { startsAt: { gte: from, lt: to } },
        select: { status: true, price: true, salaryPercent: true },
      },
    },
    orderBy: [{ branch: { name: "asc" } }, { specialization: "asc" }],
  });

  return specialists.map((sp) => {
    let done = 0;
    let noShow = 0;
    let planned = 0;
    let revenue = 0;
    let salary = 0;

    for (const s of sp.sessions) {
      if (s.status === "DONE") done++;
      else if (s.status === "NO_SHOW") noShow++;
      else if (s.status === "PLANNED") planned++;
      if (isBillable(s.status)) {
        revenue += s.price;
        salary += Math.round((s.price * (s.salaryPercent ?? sp.salaryPercent)) / 100);
      }
    }

    return {
      id: sp.id,
      fullName: sp.user.fullName,
      specialization: sp.specialization,
      branchName: sp.branch.name,
      salaryPercent: sp.salaryPercent,
      clients: sp._count.clients,
      done,
      noShow,
      planned,
      revenue,
      salary,
    };
  });
}

/* ---------------- Mutaxassis ish haqi: hisoblangan / to'langan / qolgan ---------------- */

export type Earnings = {
  /** Boshidan beri o'tgan seanslardan hisoblangan */
  accruedTotal: number;
  /** Boshidan beri qo'lga tegkan (to'lab berilgan) */
  paidTotal: number;
  /** Qolgan (hisoblangan − to'langan) */
  balance: number;
  /** Shu oyda hisoblangan */
  accruedMonth: number;
  /** Shu oyda to'langan */
  paidMonth: number;
  doneMonth: number;
  noShowMonth: number;
  plannedMonth: number;
};

const salaryOf = (
  s: { status: string; price: number; salaryPercent: number | null },
  fallbackPercent: number,
) => (isBillable(s.status) ? Math.round((s.price * (s.salaryPercent ?? fallbackPercent)) / 100) : 0);

/** Bitta mutaxassisning puli: hisoblangan, to'langan va qolgan qismi */
export async function getSpecialistEarnings(specialistId: string): Promise<Earnings> {
  const month = monthRange();

  const specialist = await prisma.specialist.findUnique({
    where: { id: specialistId },
    select: { salaryPercent: true },
  });
  const fallback = specialist?.salaryPercent ?? 0;

  const [sessions, payouts] = await Promise.all([
    prisma.session.findMany({
      where: { specialistId },
      select: { status: true, price: true, salaryPercent: true, startsAt: true },
    }),
    prisma.salaryPayout.findMany({
      where: { specialistId },
      select: { amount: true, paidAt: true },
    }),
  ]);

  let accruedTotal = 0;
  let accruedMonth = 0;
  let doneMonth = 0;
  let noShowMonth = 0;
  let plannedMonth = 0;

  for (const s of sessions) {
    const value = salaryOf(s, fallback);
    accruedTotal += value;

    const inMonth = s.startsAt >= month.from && s.startsAt < month.to;
    if (!inMonth) continue;
    accruedMonth += value;
    if (s.status === "DONE") doneMonth++;
    else if (s.status === "NO_SHOW") noShowMonth++;
    else if (s.status === "PLANNED") plannedMonth++;
  }

  let paidTotal = 0;
  let paidMonth = 0;
  for (const p of payouts) {
    paidTotal += p.amount;
    if (p.paidAt >= month.from && p.paidAt < month.to) paidMonth += p.amount;
  }

  return {
    accruedTotal,
    paidTotal,
    balance: accruedTotal - paidTotal,
    accruedMonth,
    paidMonth,
    doneMonth,
    noShowMonth,
    plannedMonth,
  };
}

export type SpecialistBalance = {
  specialistId: string;
  fullName: string;
  specialization: string;
  branchName: string;
  accrued: number;
  paid: number;
  balance: number;
};

/** Barcha mutaxassislarning qarz holati (admin uchun) */
export async function getSpecialistBalances(opts: {
  branchId?: string | null;
}): Promise<SpecialistBalance[]> {
  const specialists = await prisma.specialist.findMany({
    where: { ...branchWhere(opts.branchId) },
    include: {
      user: { select: { fullName: true } },
      branch: { select: { name: true } },
      sessions: { select: { status: true, price: true, salaryPercent: true } },
      payouts: { select: { amount: true } },
    },
    orderBy: [{ branch: { name: "asc" } }, { specialization: "asc" }],
  });

  return specialists.map((sp) => {
    const accrued = sp.sessions.reduce((sum, s) => sum + salaryOf(s, sp.salaryPercent), 0);
    const paid = sp.payouts.reduce((sum, p) => sum + p.amount, 0);
    return {
      specialistId: sp.id,
      fullName: sp.user.fullName,
      specialization: sp.specialization,
      branchName: sp.branch.name,
      accrued,
      paid,
      balance: accrued - paid,
    };
  });
}

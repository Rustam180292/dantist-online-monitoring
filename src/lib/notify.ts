import "server-only";
import { prisma } from "@/lib/prisma";
import { sendMessage } from "@/lib/telegram";
import { BILLABLE_STATUSES, SPECIALIZATIONS, type SessionStatus, type Specialization } from "@/lib/constants";
import { dateShort, money, timeUz, weekdayUz } from "@/lib/format";
import { addDays, startOfDay } from "@/lib/stats";

/**
 * Ota-onalarga Telegram orqali yuboriladigan eslatmalar.
 *
 * Ikki qadamli ishlaydi:
 *   1) navbatga qo'yish — kerakli xabarlar Notification jadvaliga yoziladi
 *      (dedupeKey bir xil xabarning ikki marta ketishiga yo'l qo'ymaydi);
 *   2) yuborish — navbatdagi xabarlar Telegram'ga jo'natiladi, muvaffaqiyatsizi
 *      keyingi urinishda qayta sinaladi (3 martagacha).
 */

const MAX_ATTEMPTS = 3;

type Candidate = {
  userId: string;
  clientId: string;
  kind: string;
  dedupeKey: string;
  text: string;
};

/** Faqat hali yo'q xabarlarni yozadi */
async function queue(candidates: Candidate[]): Promise<number> {
  if (candidates.length === 0) return 0;

  const existing = await prisma.notification.findMany({
    where: { dedupeKey: { in: candidates.map((c) => c.dedupeKey) } },
    select: { dedupeKey: true },
  });
  const seen = new Set(existing.map((e) => e.dedupeKey));
  const fresh = candidates.filter((c) => !seen.has(c.dedupeKey));
  if (fresh.length === 0) return 0;

  const result = await prisma.notification.createMany({ data: fresh });
  return result.count;
}

/** Yil-hafta kaliti: "2026-W40" */
function weekKey(d: Date): string {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((x.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${x.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/* ---------------- 1. Ertangi mashg'ulot eslatmasi ---------------- */

export async function queueTomorrowReminders(now: Date = new Date()): Promise<number> {
  const from = addDays(startOfDay(now), 1);
  const to = addDays(from, 1);

  const sessions = await prisma.session.findMany({
    where: {
      status: "PLANNED",
      startsAt: { gte: from, lt: to },
      client: { status: "ACTIVE", parent: { telegramId: { not: null }, isActive: true } },
    },
    include: {
      client: { select: { id: true, fullName: true, parentUserId: true } },
      specialist: { include: { user: { select: { fullName: true } } } },
      branch: { select: { name: true } },
    },
  });

  return queue(
    sessions.flatMap((s) => {
      if (!s.client.parentUserId) return [];
      const spec = SPECIALIZATIONS[s.specialist.specialization as Specialization];
      return [
        {
          userId: s.client.parentUserId,
          clientId: s.client.id,
          kind: "SESSION_REMINDER",
          dedupeKey: `SESSION_REMINDER:${s.id}`,
          text:
            `🔔 <b>Eslatma</b>\n\n` +
            `Ertaga (${weekdayUz(s.startsAt).toLowerCase()}, ${dateShort(s.startsAt)}) ` +
            `soat <b>${timeUz(s.startsAt)}</b> da <b>${s.client.fullName}</b> uchun ` +
            `${spec} mashg'uloti bor.\n` +
            `Mutaxassis: ${s.specialist.user.fullName}\n` +
            `Manzil: ${s.branch.name}`,
        },
      ];
    }),
  );
}

/* ---------------- 2. Abonement tugayapti ---------------- */

export async function queueLowPackageAlerts(threshold = 2): Promise<number> {
  const packages = await prisma.package.findMany({
    where: {
      isActive: true,
      client: { status: "ACTIVE", parent: { telegramId: { not: null }, isActive: true } },
    },
    include: {
      client: { select: { id: true, fullName: true, parentUserId: true } },
      sessions: { select: { status: true } },
    },
  });

  const candidates: Candidate[] = [];
  for (const p of packages) {
    if (!p.client.parentUserId) continue;
    const used = p.sessions.filter((s) =>
      BILLABLE_STATUSES.includes(s.status as SessionStatus),
    ).length;
    const remaining = Math.max(p.totalSessions - used, 0);
    if (remaining > threshold) continue;

    const spec = SPECIALIZATIONS[p.specialization as Specialization];
    candidates.push({
      userId: p.client.parentUserId,
      clientId: p.client.id,
      kind: "PACKAGE_LOW",
      // Qolgan seans kamayganda yangi xabar ketadi (2 -> 1 -> 0)
      dedupeKey: `PACKAGE_LOW:${p.id}:${remaining}`,
      text:
        `⏳ <b>Abonement tugayapti</b>\n\n` +
        `<b>${p.client.fullName}</b> · ${spec} yo'nalishi bo'yicha ` +
        (remaining === 0 ? "seanslar tugadi." : `<b>${remaining} ta</b> seans qoldi.`) +
        `\n\nYangilash uchun administratorga murojaat qiling.`,
    });
  }

  return queue(candidates);
}

/* ---------------- 3. Qarzdorlik eslatmasi (haftada bir marta) ---------------- */

export async function queueDebtReminders(now: Date = new Date()): Promise<number> {
  const packages = await prisma.package.findMany({
    where: {
      isActive: true,
      client: { status: "ACTIVE", parent: { telegramId: { not: null }, isActive: true } },
    },
    include: {
      client: { select: { id: true, fullName: true, parentUserId: true } },
      payments: { select: { amount: true } },
    },
  });

  const week = weekKey(now);
  const candidates: Candidate[] = [];

  for (const p of packages) {
    if (!p.client.parentUserId) continue;
    const paid = p.payments.reduce((sum, x) => sum + x.amount, 0);
    const debt = p.totalSessions * p.pricePerSession - paid;
    if (debt <= 0) continue;

    const spec = SPECIALIZATIONS[p.specialization as Specialization];
    candidates.push({
      userId: p.client.parentUserId,
      clientId: p.client.id,
      kind: "DEBT",
      dedupeKey: `DEBT:${p.id}:${week}`,
      text:
        `💳 <b>To'lov eslatmasi</b>\n\n` +
        `<b>${p.client.fullName}</b> · ${spec} abonementi bo'yicha ` +
        `<b>${money(debt)}</b> to'lanmagan.\n\n` +
        `Savollar bo'lsa administratorga murojaat qiling.`,
    });
  }

  return queue(candidates);
}

/* ---------------- 4. Mashg'ulot o'tdi (seans belgilangan zahoti) ---------------- */

export async function queueSessionDone(sessionId: string): Promise<number> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      client: { select: { id: true, fullName: true, parentUserId: true, status: true } },
      specialist: { include: { user: { select: { fullName: true } } } },
      package: { select: { id: true, totalSessions: true } },
    },
  });

  if (!session || session.status !== "DONE") return 0;
  if (!session.client.parentUserId) return 0;

  const parent = await prisma.user.findUnique({
    where: { id: session.client.parentUserId },
    select: { telegramId: true, isActive: true },
  });
  if (!parent?.telegramId || !parent.isActive) return 0;

  let remainingLine = "";
  if (session.package) {
    const used = await prisma.session.count({
      where: { packageId: session.package.id, status: { in: ["DONE", "NO_SHOW"] } },
    });
    const remaining = Math.max(session.package.totalSessions - used, 0);
    remainingLine = `\nAbonementda qolgan seans: <b>${remaining}</b>`;
  }

  const spec = SPECIALIZATIONS[session.specialist.specialization as Specialization];

  return queue([
    {
      userId: session.client.parentUserId,
      clientId: session.client.id,
      kind: "SESSION_DONE",
      dedupeKey: `SESSION_DONE:${session.id}`,
      text:
        `✅ <b>Mashg'ulot o'tdi</b>\n\n` +
        `<b>${session.client.fullName}</b> · ${spec}\n` +
        `Mutaxassis: ${session.specialist.user.fullName}\n` +
        `Vaqt: ${dateShort(session.startsAt)} ${timeUz(session.startsAt)}` +
        remainingLine,
    },
  ]);
}

/**
 * Odam yozgan matn Telegram'ga HTML bo'lib ketadi: "<" yoki "&" bo'lsa
 * Telegram butun xabarni rad etadi, teg bo'lsa esa uni bajarib yuboradi.
 */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ---------------- 5. Ota-ona mashg'ulotni bekor qildi ---------------- */

/**
 * Xabar mutaxassisning o'ziga va shu filial xodimlariga (qabulxona, admin)
 * boradi — vaqt bo'shadi, uni boshqa bolaga berish mumkin. Ega ham oladi,
 * lekin yakka mutaxassisning filialida ega yo'q: u markazga tegishli emas.
 */
export async function queueParentCancel(sessionId: string, reason: string): Promise<number> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      client: { select: { id: true, fullName: true } },
      specialist: { select: { userId: true, specialization: true } },
      branch: { select: { id: true, isSolo: true } },
    },
  });
  if (!session) return 0;

  const staff = await prisma.user.findMany({
    where: {
      isActive: true,
      telegramId: { not: null },
      OR: [
        { id: session.specialist.userId },
        ...(session.branch.isSolo
          ? []
          : [
              { branchId: session.branch.id, role: { in: ["RECEPTION", "BRANCH_ADMIN"] } },
              { role: "OWNER" },
            ]),
      ],
    },
    select: { id: true },
  });

  const spec = SPECIALIZATIONS[session.specialist.specialization as Specialization];
  const text =
    `❌ <b>Ota-ona mashg'ulotni bekor qildi</b>\n\n` +
    `<b>${session.client.fullName}</b> · ${spec}\n` +
    `Vaqt: ${weekdayUz(session.startsAt)}, ${dateShort(session.startsAt)} ${timeUz(session.startsAt)}` +
    (reason ? `\nSababi: ${escapeHtml(reason)}` : "") +
    `\n\nBu vaqt endi bo'sh.`;

  return queue(
    staff.map((u) => ({
      userId: u.id,
      clientId: session.client.id,
      kind: "PARENT_CANCEL",
      dedupeKey: `PARENT_CANCEL:${session.id}:${u.id}`,
      text,
    })),
  );
}

/* ---------------- Navbatdagilarni yuborish ---------------- */

export async function sendPending(limit = 50): Promise<{ sent: number; failed: number }> {
  const pending = await prisma.notification.findMany({
    where: { sentAt: null, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { user: { select: { telegramId: true, isActive: true } } },
  });

  let sent = 0;
  let failed = 0;

  for (const n of pending) {
    if (!n.user.telegramId || !n.user.isActive) {
      await prisma.notification.update({
        where: { id: n.id },
        data: { attempts: MAX_ATTEMPTS, error: "Telegram akkaunti bog'lanmagan" },
      });
      failed++;
      continue;
    }

    const ok = await sendMessage(n.user.telegramId, n.text);
    if (ok) {
      await prisma.notification.update({
        where: { id: n.id },
        data: { sentAt: new Date(), error: null, attempts: { increment: 1 } },
      });
      sent++;
    } else {
      await prisma.notification.update({
        where: { id: n.id },
        data: { attempts: { increment: 1 }, error: "Telegram'ga yuborilmadi" },
      });
      failed++;
    }
  }

  return { sent, failed };
}

/** Cron chaqiradigan to'liq sikl */
export async function runNotifications(now: Date = new Date()) {
  const reminders = await queueTomorrowReminders(now);
  const packageLow = await queueLowPackageAlerts();
  const debt = await queueDebtReminders(now);
  const { sent, failed } = await sendPending();

  return { queued: { reminders, packageLow, debt }, sent, failed };
}

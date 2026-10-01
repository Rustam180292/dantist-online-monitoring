"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { SESSION_STATUS_KEYS, type SessionStatus } from "@/lib/constants";

/** Seansni o'zgartirishga ruxsat bormi? */
async function assertCanEdit(sessionId: string) {
  const user = await requireUser();
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, branchId: true, specialistId: true },
  });
  if (!session) throw new Error("Seans topilmadi.");

  switch (user.role) {
    case "OWNER":
      break;
    case "BRANCH_ADMIN":
      if (session.branchId !== user.branchId) throw new Error("Bu filial sizga tegishli emas.");
      break;
    case "SPECIALIST":
      if (session.specialistId !== user.specialistId) throw new Error("Bu seans sizga tegishli emas.");
      break;
    default:
      throw new Error("Sizda bu amal uchun ruxsat yo'q.");
  }
  return { user, session };
}

/** Davomat belgilash: O'tdi / Kelmadi / Bekor qilindi */
export async function setSessionStatus(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "");
  const status = String(formData.get("status") ?? "") as SessionStatus;
  if (!SESSION_STATUS_KEYS.includes(status)) throw new Error("Holat noto'g'ri.");

  await assertCanEdit(sessionId);

  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    include: { package: { select: { pricePerSession: true } } },
  });

  // "O'tdi" yoki "Kelmadi" — seans abonementdan yechiladi va narxi yoziladi.
  const billable = status === "DONE" || status === "NO_SHOW";
  const price = billable ? (session.price || session.package?.pricePerSession || 0) : 0;

  await prisma.session.update({
    where: { id: sessionId },
    data: { status, price },
  });

  revalidatePath("/schedule");
  revalidatePath("/");
  revalidatePath(`/clients/${session.clientId}`);
  revalidatePath("/reports");
}

/** Yangi seans qo'shish */
export async function createSession(formData: FormData) {
  const user = await requireUser();
  if (user.role === "PARENT") throw new Error("Sizda bu amal uchun ruxsat yo'q.");

  const clientId = String(formData.get("clientId") ?? "");
  const specialistId = String(formData.get("specialistId") ?? "");
  const startsAtRaw = String(formData.get("startsAt") ?? "");
  const durationMin = Number(formData.get("durationMin") ?? 45);

  if (!clientId || !specialistId || !startsAtRaw) {
    throw new Error("Mijoz, mutaxassis va vaqtni to'liq kiriting.");
  }

  const startsAt = new Date(startsAtRaw);
  if (Number.isNaN(startsAt.getTime())) throw new Error("Vaqt formati noto'g'ri.");

  const [client, specialist] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { id: true, branchId: true } }),
    prisma.specialist.findUnique({
      where: { id: specialistId },
      select: { id: true, branchId: true, specialization: true },
    }),
  ]);
  if (!client || !specialist) throw new Error("Mijoz yoki mutaxassis topilmadi.");

  if (user.role === "BRANCH_ADMIN" && client.branchId !== user.branchId) {
    throw new Error("Bu mijoz sizning filialingizga tegishli emas.");
  }
  if (user.role === "SPECIALIST" && specialist.id !== user.specialistId) {
    throw new Error("Faqat o'zingizga seans qo'sha olasiz.");
  }
  if (client.branchId !== specialist.branchId) {
    throw new Error("Mijoz va mutaxassis bitta filialda bo'lishi kerak.");
  }

  // Shu vaqtda mutaxassis band emasmi?
  const end = new Date(startsAt.getTime() + durationMin * 60_000);
  const clash = await prisma.session.findFirst({
    where: {
      specialistId,
      status: { in: ["PLANNED", "DONE"] },
      startsAt: { gte: new Date(startsAt.getTime() - 3 * 60 * 60_000), lt: end },
    },
    select: { startsAt: true, durationMin: true },
  });
  if (clash) {
    const clashEnd = new Date(clash.startsAt.getTime() + clash.durationMin * 60_000);
    if (clashEnd > startsAt) throw new Error("Mutaxassisning bu vaqti band.");
  }

  // Shu mutaxassislik bo'yicha faol abonementni topib, narxni olamiz
  const pkg = await prisma.package.findFirst({
    where: { clientId, specialization: specialist.specialization, isActive: true },
    orderBy: { purchasedAt: "desc" },
    select: { id: true, pricePerSession: true },
  });

  await prisma.session.create({
    data: {
      clientId,
      specialistId,
      branchId: client.branchId,
      packageId: pkg?.id ?? null,
      startsAt,
      durationMin,
      status: "PLANNED",
      price: 0,
      note: String(formData.get("note") ?? "").trim() || null,
    },
  });

  // Mijoz hali bu mutaxassisga biriktirilmagan bo'lsa — biriktiramiz
  await prisma.assignment.upsert({
    where: { clientId_specialistId: { clientId, specialistId } },
    create: { clientId, specialistId },
    update: {},
  });

  revalidatePath("/schedule");
  revalidatePath("/");
  revalidatePath(`/clients/${clientId}`);
}

/** Seansni o'chirish (faqat rejadagisini) */
export async function deleteSession(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "");
  const { session } = await assertCanEdit(sessionId);

  const current = await prisma.session.findUniqueOrThrow({
    where: { id: session.id },
    select: { status: true, clientId: true },
  });
  if (current.status !== "PLANNED") {
    throw new Error("Faqat rejadagi seansni o'chirish mumkin.");
  }

  await prisma.session.delete({ where: { id: sessionId } });
  revalidatePath("/schedule");
  revalidatePath(`/clients/${current.clientId}`);
}

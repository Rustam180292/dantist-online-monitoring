"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword, requireUser, type CurrentUser } from "@/lib/auth";
import {
  CLIENT_STATUS_KEYS,
  PAYMENT_METHOD_KEYS,
  SPECIALIZATION_KEYS,
  type ClientStatus,
  type PaymentMethod,
  type Specialization,
} from "@/lib/constants";

/** Faqat OWNER va BRANCH_ADMIN o'zgartirishi mumkin */
async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "OWNER" && user.role !== "BRANCH_ADMIN") {
    throw new Error("Sizda bu amal uchun ruxsat yo'q.");
  }
  return user;
}

async function assertClientAccess(user: CurrentUser, clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, branchId: true },
  });
  if (!client) throw new Error("Mijoz topilmadi.");
  if (user.role === "BRANCH_ADMIN" && client.branchId !== user.branchId) {
    throw new Error("Bu mijoz sizning filialingizga tegishli emas.");
  }
  return client;
}

function parseAmount(raw: FormDataEntryValue | null, field: string): number {
  // "150 000" yoki "150000" ko'rinishini ham qabul qiladi
  const n = Number(String(raw ?? "").replace(/[^\d]/g, ""));
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${field} to'g'ri kiritilmagan.`);
  return Math.round(n);
}

/** Yangi mijoz (bola) qo'shish */
export async function createClient(formData: FormData) {
  const user = await requireAdmin();

  const fullName = String(formData.get("fullName") ?? "").trim();
  const birthDateRaw = String(formData.get("birthDate") ?? "");
  const parentName = String(formData.get("parentName") ?? "").trim();
  const parentPhone = String(formData.get("parentPhone") ?? "").trim();
  const branchId =
    user.role === "OWNER" ? String(formData.get("branchId") ?? "") : (user.branchId ?? "");
  const parentPassword = String(formData.get("parentPassword") ?? "");

  if (!fullName || !birthDateRaw || !parentName || !parentPhone || !branchId) {
    throw new Error("Majburiy maydonlarni to'liq to'ldiring.");
  }

  const birthDate = new Date(birthDateRaw);
  if (Number.isNaN(birthDate.getTime())) throw new Error("Tug'ilgan sana noto'g'ri.");

  // Ota-onaga kabinet ochish (parol kiritilgan bo'lsa)
  let parentUserId: string | null = null;
  const existingParent = await prisma.user.findUnique({ where: { phone: parentPhone } });
  if (existingParent) {
    parentUserId = existingParent.id;
  } else if (parentPassword) {
    if (parentPassword.length < 5) throw new Error("Ota-ona uchun parol kamida 5 belgidan bo'lsin.");
    const created = await prisma.user.create({
      data: {
        phone: parentPhone,
        fullName: parentName,
        passwordHash: hashPassword(parentPassword),
        role: "PARENT",
        branchId,
      },
    });
    parentUserId = created.id;
  }

  const client = await prisma.client.create({
    data: {
      fullName,
      birthDate,
      gender: String(formData.get("gender") ?? "") || null,
      branchId,
      parentUserId,
      parentName,
      parentPhone,
      diagnosis: String(formData.get("diagnosis") ?? "").trim() || null,
      note: String(formData.get("note") ?? "").trim() || null,
      status: "ACTIVE",
    },
  });

  revalidatePath("/clients");
  revalidatePath("/");
  redirect(`/clients/${client.id}`);
}

/** Mijoz holatini o'zgartirish: Faol / To'xtatilgan / Arxiv */
export async function setClientStatus(formData: FormData) {
  const user = await requireAdmin();
  const clientId = String(formData.get("clientId") ?? "");
  const status = String(formData.get("status") ?? "") as ClientStatus;
  if (!CLIENT_STATUS_KEYS.includes(status)) throw new Error("Holat noto'g'ri.");

  await assertClientAccess(user, clientId);
  await prisma.client.update({ where: { id: clientId }, data: { status } });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
}

/** Mijozni mutaxassisga biriktirish */
export async function assignSpecialist(formData: FormData) {
  const user = await requireAdmin();
  const clientId = String(formData.get("clientId") ?? "");
  const specialistId = String(formData.get("specialistId") ?? "");
  if (!specialistId) throw new Error("Mutaxassisni tanlang.");

  const client = await assertClientAccess(user, clientId);
  const specialist = await prisma.specialist.findUnique({
    where: { id: specialistId },
    select: { branchId: true },
  });
  if (!specialist) throw new Error("Mutaxassis topilmadi.");
  if (specialist.branchId !== client.branchId) {
    throw new Error("Mutaxassis boshqa filialda ishlaydi.");
  }

  await prisma.assignment.upsert({
    where: { clientId_specialistId: { clientId, specialistId } },
    create: { clientId, specialistId },
    update: {},
  });

  revalidatePath(`/clients/${clientId}`);
}

/** Biriktirishni olib tashlash */
export async function unassignSpecialist(formData: FormData) {
  const user = await requireAdmin();
  const clientId = String(formData.get("clientId") ?? "");
  const specialistId = String(formData.get("specialistId") ?? "");
  await assertClientAccess(user, clientId);

  await prisma.assignment
    .delete({ where: { clientId_specialistId: { clientId, specialistId } } })
    .catch(() => null);

  revalidatePath(`/clients/${clientId}`);
}

/** Abonement (seans paketi) sotish */
export async function addPackage(formData: FormData) {
  const user = await requireAdmin();
  const clientId = String(formData.get("clientId") ?? "");
  const specialization = String(formData.get("specialization") ?? "") as Specialization;
  if (!SPECIALIZATION_KEYS.includes(specialization)) {
    throw new Error("Mutaxassislik turini tanlang.");
  }

  const totalSessions = Number(formData.get("totalSessions") ?? 0);
  if (!Number.isInteger(totalSessions) || totalSessions < 1 || totalSessions > 100) {
    throw new Error("Seans soni 1 dan 100 gacha bo'lishi kerak.");
  }
  const pricePerSession = parseAmount(formData.get("pricePerSession"), "Seans narxi");

  await assertClientAccess(user, clientId);

  const expiresAtRaw = String(formData.get("expiresAt") ?? "");
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;

  const pkg = await prisma.package.create({
    data: {
      clientId,
      specialization,
      totalSessions,
      pricePerSession,
      expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
    },
  });

  // Darhol to'lov kiritilgan bo'lsa, shu abonementga yozamiz
  const prepaidRaw = String(formData.get("prepaid") ?? "").replace(/[^\d]/g, "");
  if (prepaidRaw && Number(prepaidRaw) > 0) {
    const client = await prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: { branchId: true },
    });
    await prisma.payment.create({
      data: {
        clientId,
        branchId: client.branchId,
        packageId: pkg.id,
        amount: Math.round(Number(prepaidRaw)),
        method: "CASH",
        note: `${totalSessions} seanslik abonement uchun`,
      },
    });
  }

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/payments");
  revalidatePath("/");
}

/** To'lov qabul qilish */
export async function addPayment(formData: FormData) {
  const user = await requireAdmin();
  const clientId = String(formData.get("clientId") ?? "");
  const amount = parseAmount(formData.get("amount"), "Summa");
  const method = String(formData.get("method") ?? "CASH") as PaymentMethod;
  if (!PAYMENT_METHOD_KEYS.includes(method)) throw new Error("To'lov usuli noto'g'ri.");

  const client = await assertClientAccess(user, clientId);
  const packageId = String(formData.get("packageId") ?? "") || null;

  const paidAtRaw = String(formData.get("paidAt") ?? "");
  const paidAtParsed = paidAtRaw ? new Date(paidAtRaw) : new Date();
  const paidAt = Number.isNaN(paidAtParsed.getTime()) ? new Date() : paidAtParsed;
  const note = String(formData.get("note") ?? "").trim() || null;

  const base = { clientId, branchId: client.branchId, method, paidAt, note };

  if (packageId) {
    // Admin aniq abonementni tanlagan
    const pkg = await prisma.package.findUnique({
      where: { id: packageId },
      select: { clientId: true },
    });
    if (!pkg || pkg.clientId !== clientId) throw new Error("Abonement bu mijozga tegishli emas.");

    await prisma.payment.create({ data: { ...base, packageId, amount } });
  } else {
    // Abonement tanlanmagan: summa qarzi bor abonementlarga eng eskisidan
    // boshlab taqsimlanadi, ortgani esa oldindan to'lov sifatida yoziladi.
    const packages = await prisma.package.findMany({
      where: { clientId, isActive: true },
      orderBy: { purchasedAt: "asc" },
      include: { payments: { select: { amount: true } } },
    });

    let left = amount;
    const rows: { packageId: string | null; amount: number }[] = [];

    for (const p of packages) {
      if (left <= 0) break;
      const paid = p.payments.reduce((sum, x) => sum + x.amount, 0);
      const debt = p.totalSessions * p.pricePerSession - paid;
      if (debt <= 0) continue;
      const part = Math.min(debt, left);
      rows.push({ packageId: p.id, amount: part });
      left -= part;
    }
    if (left > 0) rows.push({ packageId: null, amount: left });

    await prisma.$transaction(
      rows.map((r) => prisma.payment.create({ data: { ...base, ...r } })),
    );
  }

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/payments");
  revalidatePath("/");
  revalidatePath("/reports");
}

/** To'lovni o'chirish (xato kiritilgan bo'lsa) */
export async function deletePayment(formData: FormData) {
  const user = await requireAdmin();
  const paymentId = String(formData.get("paymentId") ?? "");
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { clientId: true, branchId: true },
  });
  if (!payment) throw new Error("To'lov topilmadi.");
  if (user.role === "BRANCH_ADMIN" && payment.branchId !== user.branchId) {
    throw new Error("Bu to'lov sizning filialingizga tegishli emas.");
  }

  await prisma.payment.delete({ where: { id: paymentId } });

  revalidatePath(`/clients/${payment.clientId}`);
  revalidatePath("/payments");
  revalidatePath("/reports");
}

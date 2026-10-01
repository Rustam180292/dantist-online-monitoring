"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hashPassword, requireUser, type CurrentUser } from "@/lib/auth";
import { SPECIALIZATION_KEYS, type Specialization } from "@/lib/constants";

async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "OWNER" && user.role !== "BRANCH_ADMIN") {
    throw new Error("Sizda bu amal uchun ruxsat yo'q.");
  }
  return user;
}

/** Yangi mutaxassis (login bilan) qo'shish */
export async function createSpecialist(formData: FormData) {
  const user = await requireAdmin();

  const fullName = String(formData.get("fullName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const specialization = String(formData.get("specialization") ?? "") as Specialization;
  const salaryPercent = Number(formData.get("salaryPercent") ?? 40);
  const branchId =
    user.role === "OWNER" ? String(formData.get("branchId") ?? "") : (user.branchId ?? "");

  if (!fullName || !phone || !branchId) throw new Error("Ism, telefon va filial majburiy.");
  if (!SPECIALIZATION_KEYS.includes(specialization)) throw new Error("Mutaxassislikni tanlang.");
  if (password.length < 5) throw new Error("Parol kamida 5 belgidan bo'lsin.");
  if (!Number.isInteger(salaryPercent) || salaryPercent < 0 || salaryPercent > 100) {
    throw new Error("Ish haqi foizi 0 dan 100 gacha bo'lishi kerak.");
  }

  const exists = await prisma.user.findUnique({ where: { phone } });
  if (exists) throw new Error("Bu telefon raqam allaqachon ro'yxatda.");

  const created = await prisma.user.create({
    data: {
      phone,
      fullName,
      passwordHash: hashPassword(password),
      role: "SPECIALIST",
      branchId,
    },
  });

  await prisma.specialist.create({
    data: { userId: created.id, branchId, specialization, salaryPercent },
  });

  revalidatePath("/specialists");
  revalidatePath("/");
}

/** Ish haqi foizini o'zgartirish */
export async function updateSalaryPercent(formData: FormData) {
  const user = await requireAdmin();
  const specialistId = String(formData.get("specialistId") ?? "");
  const salaryPercent = Number(formData.get("salaryPercent") ?? 0);
  if (!Number.isInteger(salaryPercent) || salaryPercent < 0 || salaryPercent > 100) {
    throw new Error("Foiz 0 dan 100 gacha bo'lishi kerak.");
  }

  const sp = await prisma.specialist.findUnique({
    where: { id: specialistId },
    select: { branchId: true },
  });
  if (!sp) throw new Error("Mutaxassis topilmadi.");
  if (user.role === "BRANCH_ADMIN" && sp.branchId !== user.branchId) {
    throw new Error("Bu mutaxassis sizning filialingizda ishlamaydi.");
  }

  await prisma.specialist.update({ where: { id: specialistId }, data: { salaryPercent } });
  revalidatePath("/specialists");
  revalidatePath("/reports");
}

/** Ishdan bo'shatish / qaytarish */
export async function toggleSpecialistActive(formData: FormData) {
  const user = await requireAdmin();
  const specialistId = String(formData.get("specialistId") ?? "");

  const sp = await prisma.specialist.findUnique({
    where: { id: specialistId },
    select: { branchId: true, isActive: true, userId: true },
  });
  if (!sp) throw new Error("Mutaxassis topilmadi.");
  if (user.role === "BRANCH_ADMIN" && sp.branchId !== user.branchId) {
    throw new Error("Bu mutaxassis sizning filialingizda ishlamaydi.");
  }

  await prisma.specialist.update({
    where: { id: specialistId },
    data: { isActive: !sp.isActive },
  });
  await prisma.user.update({ where: { id: sp.userId }, data: { isActive: !sp.isActive } });

  revalidatePath("/specialists");
}

/** Mutaxassisga ish haqi to'lab berish */
export async function paySalary(formData: FormData) {
  const user = await requireAdmin();
  const specialistId = String(formData.get("specialistId") ?? "");

  const amount = Math.round(Number(String(formData.get("amount") ?? "").replace(/[^\d]/g, "")));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Summa to'g'ri kiritilmagan.");

  const method = String(formData.get("method") ?? "CASH");
  if (!["CASH", "CARD", "TRANSFER"].includes(method)) throw new Error("To'lov usuli noto'g'ri.");

  const sp = await prisma.specialist.findUnique({
    where: { id: specialistId },
    select: { branchId: true },
  });
  if (!sp) throw new Error("Mutaxassis topilmadi.");
  if (user.role === "BRANCH_ADMIN" && sp.branchId !== user.branchId) {
    throw new Error("Bu mutaxassis sizning filialingizda ishlamaydi.");
  }

  const paidAtRaw = String(formData.get("paidAt") ?? "");
  const paidAt = paidAtRaw ? new Date(paidAtRaw) : new Date();

  await prisma.salaryPayout.create({
    data: {
      specialistId,
      branchId: sp.branchId,
      amount,
      method,
      paidAt: Number.isNaN(paidAt.getTime()) ? new Date() : paidAt,
      note: String(formData.get("note") ?? "").trim() || null,
      createdById: user.id,
    },
  });

  revalidatePath("/specialists");
  revalidatePath("/earnings");
  revalidatePath("/reports");
}

/** Xato kiritilgan ish haqi to'lovini o'chirish */
export async function deletePayout(formData: FormData) {
  const user = await requireAdmin();
  const payoutId = String(formData.get("payoutId") ?? "");

  const payout = await prisma.salaryPayout.findUnique({
    where: { id: payoutId },
    select: { branchId: true },
  });
  if (!payout) throw new Error("To'lov topilmadi.");
  if (user.role === "BRANCH_ADMIN" && payout.branchId !== user.branchId) {
    throw new Error("Bu to'lov sizning filialingizga tegishli emas.");
  }

  await prisma.salaryPayout.delete({ where: { id: payoutId } });
  revalidatePath("/specialists");
  revalidatePath("/earnings");
}

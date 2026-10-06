"use server";

import { revalidatePath } from "next/cache";
import { withFlash } from "@/lib/action";
import { setFlash } from "@/lib/flash";
import { prisma } from "@/lib/prisma";
import { hashPassword, requireUser, verifyPassword } from "@/lib/auth";

/** Markaz sozlamalarini faqat egasi o'zgartiradi */
async function requireOwner() {
  const user = await requireUser();
  if (user.role !== "OWNER") throw new Error("Bu amalni faqat markaz egasi bajara oladi.");
  return user;
}

function refresh() {
  revalidatePath("/settings");
  revalidatePath("/slots");
  revalidatePath("/schedule");
  revalidatePath("/");
}

function num(formData: FormData, field: string): number {
  return Math.round(Number(String(formData.get(field) ?? "").replace(/[^\d]/g, "")));
}

/** Markaz nomi va telefoni */
async function updateCenterImpl(formData: FormData) {
  await requireOwner();

  const centerName = String(formData.get("centerName") ?? "").trim();
  if (!centerName) throw new Error("Markaz nomi majburiy.");
  const centerPhone = String(formData.get("centerPhone") ?? "").trim() || null;

  await prisma.settings.upsert({
    where: { id: "main" },
    create: { id: "main", centerName, centerPhone },
    update: { centerName, centerPhone },
  });

  refresh();
  await setFlash("Markaz ma'lumoti saqlandi.", "ok");
}

/** Standart seans narxi va ulush foizi */
async function updatePricingImpl(formData: FormData) {
  await requireOwner();

  const defaultPrice = num(formData, "defaultPrice");
  const defaultSalaryPercent = num(formData, "defaultSalaryPercent");

  if (!Number.isFinite(defaultPrice) || defaultPrice <= 0) {
    throw new Error("Seans narxi to'g'ri kiritilmagan.");
  }
  if (!Number.isInteger(defaultSalaryPercent) || defaultSalaryPercent < 0 || defaultSalaryPercent > 100) {
    throw new Error("Ulush foizi 0 dan 100 gacha bo'lishi kerak.");
  }

  await prisma.settings.upsert({
    where: { id: "main" },
    create: { id: "main", defaultPrice, defaultSalaryPercent },
    update: { defaultPrice, defaultSalaryPercent },
  });

  refresh();
  await setFlash("Narx va ulush saqlandi.", "ok");
}

/**
 * Ish vaqti.
 *
 * Bo'sh vaqtlar shu sozlamadan hisoblanadi, shuning uchun qiymatlar
 * mantiqan to'g'ri bo'lishi tekshiriladi: tugash boshlanishdan keyin,
 * oraliq esa ish kuniga sig'adigan bo'lsin.
 */
async function updateWorkHoursImpl(formData: FormData) {
  await requireOwner();

  const workStartHour = num(formData, "workStartHour");
  const workEndHour = num(formData, "workEndHour");
  const slotMinutes = num(formData, "slotMinutes");
  const workDays = formData
    .getAll("workDays")
    .map((x) => Number(x))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);

  if (!Number.isInteger(workStartHour) || workStartHour < 0 || workStartHour > 23) {
    throw new Error("Ish boshlanish soati 0 dan 23 gacha bo'lishi kerak.");
  }
  if (!Number.isInteger(workEndHour) || workEndHour < 1 || workEndHour > 24) {
    throw new Error("Ish tugash soati 1 dan 24 gacha bo'lishi kerak.");
  }
  if (workEndHour <= workStartHour) {
    throw new Error("Ish tugash soati boshlanishidan keyin bo'lishi kerak.");
  }
  if (!Number.isInteger(slotMinutes) || slotMinutes < 15 || slotMinutes > 240) {
    throw new Error("Vaqt oralig'i 15 dan 240 daqiqagacha bo'lishi kerak.");
  }
  if (workDays.length === 0) throw new Error("Kamida bitta ish kuni belgilang.");

  await prisma.settings.upsert({
    where: { id: "main" },
    create: {
      id: "main",
      workStartHour,
      workEndHour,
      slotMinutes,
      workDays: workDays.join(","),
    },
    update: { workStartHour, workEndHour, slotMinutes, workDays: workDays.join(",") },
  });

  refresh();
  await setFlash("Ish vaqti saqlandi.", "ok");
}

/**
 * O'z parolini o'zgartirish.
 *
 * Har bir foydalanuvchi uchun — mutaxassis parolini unutganda adminni
 * kutib o'tirmasin. Joriy parol so'raladi: kimdir ochiq qolgan kompyuterda
 * parolni almashtirib ketmasligi uchun.
 */
async function changePasswordImpl(formData: FormData) {
  const user = await requireUser();

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const repeat = String(formData.get("repeatPassword") ?? "");

  if (next.length < 5) throw new Error("Yangi parol kamida 5 belgidan bo'lsin.");
  if (next !== repeat) throw new Error("Yangi parol takrori mos kelmadi.");

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!row) throw new Error("Foydalanuvchi topilmadi.");
  if (!verifyPassword(current, row.passwordHash)) throw new Error("Joriy parol noto'g'ri.");

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(next) },
  });

  revalidatePath("/settings");
  await setFlash("Parol o'zgartirildi.", "ok");
}

export const updateCenter = withFlash(updateCenterImpl);
export const updatePricing = withFlash(updatePricingImpl);
export const updateWorkHours = withFlash(updateWorkHoursImpl);
export const changePassword = withFlash(changePasswordImpl);

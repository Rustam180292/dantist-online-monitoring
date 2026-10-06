"use server";

import { revalidatePath } from "next/cache";
import { withFlash } from "@/lib/action";
import { setFlash } from "@/lib/flash";
import { dateTimeUz, money } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requireUser, type CurrentUser } from "@/lib/auth";
import {
  INTAKE_RESULT_KEYS,
  INTAKE_STATUS_KEYS,
  PAYMENT_METHOD_KEYS,
  type IntakeResult,
  type IntakeStatus,
  type PaymentMethod,
} from "@/lib/constants";

/** Qabullar bilan egasi, filial admini va qabulxona xodimi ishlaydi */
async function requireFrontDesk(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "OWNER" && user.role !== "BRANCH_ADMIN" && user.role !== "RECEPTION") {
    throw new Error("Sizda bu amal uchun ruxsat yo'q.");
  }
  return user;
}

/** Qabul shu xodimning filialiga tegishlimi */
async function assertOwnBranch(intakeId: string) {
  const user = await requireFrontDesk();
  const intake = await prisma.intake.findUnique({
    where: { id: intakeId },
    include: { client: { select: { id: true } } },
  });
  if (!intake) throw new Error("Qabul topilmadi.");
  if (user.role !== "OWNER" && intake.branchId !== user.branchId) {
    throw new Error("Bu qabul sizning filialingizga tegishli emas.");
  }
  return { user, intake };
}

function refresh() {
  revalidatePath("/intakes");
  revalidatePath("/");
  revalidatePath("/reports");
}

/** Yangi qabul yozish */
async function createIntakeImpl(formData: FormData) {
  const user = await requireFrontDesk();

  const childName = String(formData.get("childName") ?? "").trim();
  const parentName = String(formData.get("parentName") ?? "").trim();
  const parentPhone = String(formData.get("parentPhone") ?? "").trim();
  const birthDateRaw = String(formData.get("birthDate") ?? "");
  const scheduledRaw = String(formData.get("scheduledAt") ?? "");
  const branchId =
    user.role === "OWNER" ? String(formData.get("branchId") ?? "") : (user.branchId ?? "");
  const specialistId = String(formData.get("specialistId") ?? "") || null;
  const price = Math.round(Number(String(formData.get("price") ?? "0").replace(/[^\d]/g, "")));

  if (!childName || !parentName || !parentPhone || !branchId) {
    throw new Error("Bola ismi, ota-ona ismi, telefon va filial majburiy.");
  }
  const birthDate = new Date(birthDateRaw);
  if (Number.isNaN(birthDate.getTime())) throw new Error("Tug'ilgan sana noto'g'ri.");
  const scheduledAt = new Date(scheduledRaw);
  if (Number.isNaN(scheduledAt.getTime())) throw new Error("Qabul vaqti noto'g'ri.");
  if (!Number.isFinite(price) || price < 0) throw new Error("Narx noto'g'ri kiritilgan.");

  if (specialistId) {
    const sp = await prisma.specialist.findUnique({
      where: { id: specialistId },
      select: { branchId: true },
    });
    if (!sp) throw new Error("Mutaxassis topilmadi.");
    if (sp.branchId !== branchId) throw new Error("Mutaxassis boshqa filialda ishlaydi.");
  }

  await prisma.intake.create({
    data: {
      branchId,
      specialistId,
      childName,
      birthDate,
      parentName,
      parentPhone,
      scheduledAt,
      price,
      note: String(formData.get("note") ?? "").trim() || null,
      createdById: user.id,
    },
  });

  refresh();
  await setFlash(`Qabul yozildi: ${childName} · ${dateTimeUz(scheduledAt)}`, "ok");
}

/**
 * Yozib bo'lingan qabulni tahrirlash.
 *
 * Nega kerak: qabul telefon orqali yoziladi va ko'p narsa keyin aniq bo'ladi —
 * qaysi mutaxassis ko'rishi, vaqti ko'chishi, ismdagi xato. Yangisini yozib,
 * eskisini o'chirish noqulay va hisobotni buzadi.
 */
async function updateIntakeImpl(formData: FormData) {
  const { user, intake } = await assertOwnBranch(String(formData.get("intakeId") ?? ""));

  const childName = String(formData.get("childName") ?? "").trim();
  const parentName = String(formData.get("parentName") ?? "").trim();
  const parentPhone = String(formData.get("parentPhone") ?? "").trim();
  const birthDateRaw = String(formData.get("birthDate") ?? "");
  const scheduledRaw = String(formData.get("scheduledAt") ?? "");
  const specialistId = String(formData.get("specialistId") ?? "") || null;
  const price = Math.round(Number(String(formData.get("price") ?? "0").replace(/[^\d]/g, "")));

  if (!childName || !parentName || !parentPhone) {
    throw new Error("Bola ismi, ota-ona ismi va telefon majburiy.");
  }
  const birthDate = new Date(birthDateRaw);
  if (Number.isNaN(birthDate.getTime())) throw new Error("Tug'ilgan sana noto'g'ri.");
  const scheduledAt = new Date(scheduledRaw);
  if (Number.isNaN(scheduledAt.getTime())) throw new Error("Qabul vaqti noto'g'ri.");
  if (!Number.isFinite(price) || price < 0) throw new Error("Narx noto'g'ri kiritilgan.");

  if (specialistId) {
    const sp = await prisma.specialist.findUnique({
      where: { id: specialistId },
      select: { branchId: true },
    });
    if (!sp) throw new Error("Mutaxassis topilmadi.");
    if (sp.branchId !== intake.branchId) throw new Error("Mutaxassis boshqa filialda ishlaydi.");
  }

  // To'lov qabul qilingan bo'lsa, summani bu yerdan o'zgartirib bo'lmaydi:
  // kassadagi raqam bilan hisobot bir-biriga mos turishi kerak.
  const data: Record<string, unknown> = {
    childName,
    parentName,
    parentPhone,
    birthDate,
    scheduledAt,
    specialistId,
    note: String(formData.get("note") ?? "").trim() || null,
  };
  if (!intake.paidAt) data.price = price;

  await prisma.intake.update({ where: { id: intake.id }, data });

  // Mijozga o'tkazilgan bo'lsa, mijoz kartasidagi ma'lumot ham yangilansin
  if (intake.clientId) {
    await prisma.client.update({
      where: { id: intake.clientId },
      data: { fullName: childName, birthDate, parentName, parentPhone },
    });
    revalidatePath(`/clients/${intake.clientId}`);
  }

  void user;
  refresh();
  // Tahrirlash formasi yopiladi va qator joyiga qaytadi — tashqaridan hech
  // narsa o'zgarmagandek ko'rinadi. Sanani ham yozamiz: boshqa oyga
  // ko'chirilgan bo'lsa, qator shu oydagi ro'yxatdan chiqib ketadi.
  await setFlash(`Saqlandi: ${childName} · ${dateTimeUz(scheduledAt)}`, "ok");
}

/** Qabul holati: bo'lib o'tdi / kelmadi / bekor qilindi */
async function setIntakeStatusImpl(formData: FormData) {
  const { intake } = await assertOwnBranch(String(formData.get("intakeId") ?? ""));
  const status = String(formData.get("status") ?? "") as IntakeStatus;
  if (!INTAKE_STATUS_KEYS.includes(status)) throw new Error("Holat noto'g'ri.");

  await prisma.intake.update({ where: { id: intake.id }, data: { status } });
  refresh();
}

/** Konsultatsiya natijasi */
async function setIntakeResultImpl(formData: FormData) {
  const { intake } = await assertOwnBranch(String(formData.get("intakeId") ?? ""));
  const result = String(formData.get("result") ?? "") as IntakeResult;
  if (!INTAKE_RESULT_KEYS.includes(result)) throw new Error("Natija noto'g'ri.");
  if (result === "CONVERTED" && !intake.clientId) {
    throw new Error("\"Mijoz bo'ldi\" ni qo'lda qo'yib bo'lmaydi — \"Mijozga o'tkazish\" tugmasidan foydalaning.");
  }

  await prisma.intake.update({ where: { id: intake.id }, data: { result } });
  refresh();
}

/** Konsultatsiya uchun to'lov qabul qilish (yoki bekor qilish) */
async function payIntakeImpl(formData: FormData) {
  const { intake } = await assertOwnBranch(String(formData.get("intakeId") ?? ""));

  if (intake.paidAt) {
    // Xato bosilgan bo'lsa — to'lovni qaytarib olish
    await prisma.intake.update({ where: { id: intake.id }, data: { paidAt: null } });
    refresh();
    await setFlash("To'lov qaytarildi.", "ok");
    return;
  }

  const price = Math.round(Number(String(formData.get("price") ?? "").replace(/[^\d]/g, "")));
  if (!Number.isFinite(price) || price <= 0) throw new Error("Summa to'g'ri kiritilmagan.");

  const method = String(formData.get("method") ?? "CASH") as PaymentMethod;
  if (!PAYMENT_METHOD_KEYS.includes(method)) throw new Error("To'lov usuli noto'g'ri.");

  await prisma.intake.update({
    where: { id: intake.id },
    data: { price, method, paidAt: new Date() },
  });
  refresh();
  await setFlash(`Konsultatsiya puli qabul qilindi: ${money(price)}`, "ok");
}

/**
 * Qabulni mijozga aylantirish.
 *
 * Ma'lumot qabulda allaqachon yozilgan — uni qayta terib o'tirmaslik uchun
 * shundan mijoz yaratiladi. Ota-ona uchun akkaunt ham ochiladi: Telegram
 * eslatmalari o'shanga bog'lanadi (mijoz qo'shishdagi mantiq bilan bir xil).
 */
async function convertIntakeImpl(formData: FormData) {
  const { intake } = await assertOwnBranch(String(formData.get("intakeId") ?? ""));
  if (intake.clientId) throw new Error("Bu qabul allaqachon mijozga o'tkazilgan.");

  let parentUserId: string | null = null;
  const existingParent = await prisma.user.findUnique({ where: { phone: intake.parentPhone } });
  if (existingParent) {
    parentUserId = existingParent.id;
  } else {
    const created = await prisma.user.create({
      data: {
        phone: intake.parentPhone,
        fullName: intake.parentName,
        passwordHash: "",
        role: "PARENT",
        branchId: intake.branchId,
      },
    });
    parentUserId = created.id;
  }

  const client = await prisma.client.create({
    data: {
      fullName: intake.childName,
      birthDate: intake.birthDate,
      branchId: intake.branchId,
      parentUserId,
      parentName: intake.parentName,
      parentPhone: intake.parentPhone,
      note: intake.note,
    },
  });

  // Konsultatsiyani ko'rgan mutaxassis bo'lsa — o'sha mijozga biriktiriladi
  if (intake.specialistId) {
    await prisma.assignment.create({
      data: { clientId: client.id, specialistId: intake.specialistId },
    });
  }

  await prisma.intake.update({
    where: { id: intake.id },
    data: { clientId: client.id, result: "CONVERTED", status: "DONE" },
  });

  refresh();
  revalidatePath("/clients");
  await setFlash(`${intake.childName} mijozlar ro'yxatiga qo'shildi.`, "ok");
}

/** Xato yozilgan qabulni o'chirish */
async function deleteIntakeImpl(formData: FormData) {
  const { intake } = await assertOwnBranch(String(formData.get("intakeId") ?? ""));
  if (intake.clientId) {
    throw new Error("Mijozga o'tkazilgan qabulni o'chirib bo'lmaydi.");
  }
  await prisma.intake.delete({ where: { id: intake.id } });
  refresh();
}

export const createIntake = withFlash(createIntakeImpl);
export const updateIntake = withFlash(updateIntakeImpl);
export const setIntakeStatus = withFlash(setIntakeStatusImpl);
export const setIntakeResult = withFlash(setIntakeResultImpl);
export const payIntake = withFlash(payIntakeImpl);
export const convertIntake = withFlash(convertIntakeImpl);
export const deleteIntake = withFlash(deleteIntakeImpl);

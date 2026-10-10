"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword, startSession } from "@/lib/auth";
import { withFlash } from "@/lib/action";
import { setFlash } from "@/lib/flash";
import { SPECIALIZATIONS, SPECIALIZATION_KEYS, type Specialization } from "@/lib/constants";
import { getSettings } from "@/lib/settings";

/**
 * Yakka ishlaydigan mutaxassisning ro'yxatdan o'tishi.
 *
 * Unga markaz kerak emas — o'ziga alohida filial ochiladi va o'sha filial
 * `isSolo` deb belgilanadi. Markazning hisobotlari, jadvali va mijozlar
 * ro'yxati bunday filialni ko'rmaydi (`src/lib/auth.ts` dagi `NOT_SOLO`),
 * ya'ni ikkovi bitta bazada tursa ham bir-biriga aralashmaydi.
 *
 * Taklif kodisiz ochilmaydi: sayt manzili ommaga ochiq, kodsiz bo'lsa
 * istalgan odam akkaunt ochib bazada joy egallab yurardi.
 */
async function registerSoloImpl(formData: FormData) {
  const settings = await getSettings();
  const expected = (settings.soloInviteCode ?? "").trim();
  if (!expected) {
    throw new Error("Hozircha ro'yxatdan o'tish yopiq. Markaz egasiga murojaat qiling.");
  }

  const code = String(formData.get("inviteCode") ?? "").trim();
  if (code.toLowerCase() !== expected.toLowerCase()) {
    throw new Error("Taklif kodi noto'g'ri.");
  }

  const fullName = String(formData.get("fullName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const specializationRaw = String(formData.get("specialization") ?? "");

  if (!fullName || !phone || !password) {
    throw new Error("Majburiy maydonlarni to'liq to'ldiring.");
  }
  if (password.length < 5) throw new Error("Parol kamida 5 belgidan bo'lsin.");
  if (!SPECIALIZATION_KEYS.includes(specializationRaw as Specialization)) {
    throw new Error("Yo'nalishni tanlang.");
  }
  const specialization = specializationRaw as Specialization;

  const taken = await prisma.user.findUnique({ where: { phone } });
  if (taken) throw new Error("Bu telefon raqam allaqachon ro'yxatda.");

  // Seans narxi ixtiyoriy — kiritilmasa markazning standart narxi olinadi
  const priceRaw = String(formData.get("price") ?? "").replace(/[^\d]/g, "");
  const price = priceRaw ? Number(priceRaw) : settings.defaultPrice;

  // Filial nomi bazada yagona bo'lishi shart — bir xil ismli ikki mutaxassis
  // kelsa ikkinchisi yiqilmasin
  const base = `${fullName} (yakka)`;
  let branchName = base;
  for (let i = 2; await prisma.branch.findUnique({ where: { name: branchName } }); i++) {
    branchName = `${base} ${i}`;
  }

  const user = await prisma.$transaction(async (tx) => {
    const branch = await tx.branch.create({
      data: { name: branchName, phone, isSolo: true },
    });
    const created = await tx.user.create({
      data: {
        phone,
        fullName,
        passwordHash: hashPassword(password),
        role: "SPECIALIST",
        branchId: branch.id,
      },
    });
    await tx.specialist.create({
      data: {
        userId: created.id,
        branchId: branch.id,
        specialization,
        defaultPrice: price,
        // Yakka ishlaydi — pulning hammasi o'ziniki, markaz ulushi yo'q
        salaryPercent: 100,
      },
    });
    // Seans faqat xizmat bilan yoziladi — birinchi xizmat darhol tayyor tursin,
    // keyin Sozlamalardan qo'shadi yoki o'zgartiradi
    await tx.sessionType.create({
      data: { branchId: branch.id, name: SPECIALIZATIONS[specialization], price, salaryPercent: 100 },
    });
    return created;
  });

  await startSession(user.id);
  await setFlash("Xush kelibsiz! Mijozlaringizni qo'sha boshlang.", "ok");
  // O'ziga rahbar — markaz egasinikidek panelga tushadi
  redirect("/");
}

export const registerSolo = withFlash(registerSoloImpl);

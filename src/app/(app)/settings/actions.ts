"use server";

import { revalidatePath } from "next/cache";
import { ActionError, withFlash } from "@/lib/action";
import { postToChannel } from "@/lib/telegram";
import { sessionTypeScope } from "@/lib/session-types";
import { setFlash } from "@/lib/flash";
import { prisma } from "@/lib/prisma";
import { hashPassword, isSolo, requireUser, verifyPassword } from "@/lib/auth";
import { sendBackupToOwners } from "@/lib/backup-send";
import { LOGO_MAX_BYTES } from "@/lib/settings";
import { SHEETS_URL_RE, syncSheets } from "@/lib/sheets";

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


/**
 * Ish vaqti.
 *
 * Bo'sh vaqtlar shu sozlamadan hisoblanadi, shuning uchun qiymatlar
 * mantiqan to'g'ri bo'lishi tekshiriladi: tugash boshlanishdan keyin,
 * oraliq esa ish kuniga sig'adigan bo'lsin.
 */
/** "13:30" -> 810; bo'sh yoki noto'g'ri bo'lsa null */
function timeToMinutes(raw: FormDataEntryValue | null): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(raw ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

async function updateWorkHoursImpl(formData: FormData) {
  // Ega — markaz ish vaqtini, yakka logoped — o'zinikini (filialida)
  const user = await requireUser();
  const solo = isSolo(user) && user.branchId ? user.branchId : null;
  if (user.role !== "OWNER" && !solo) {
    throw new Error("Bu amalni faqat markaz egasi bajara oladi.");
  }

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

  // Tushlik ixtiyoriy, lekin yozilsa — ikkala chegarasi ham, ish vaqti ichida
  const lunchStartRaw = String(formData.get("lunchStart") ?? "").trim();
  const lunchEndRaw = String(formData.get("lunchEnd") ?? "").trim();
  let lunchStartMin: number | null = null;
  let lunchEndMin: number | null = null;
  if (lunchStartRaw || lunchEndRaw) {
    lunchStartMin = timeToMinutes(lunchStartRaw);
    lunchEndMin = timeToMinutes(lunchEndRaw);
    if (lunchStartMin == null || lunchEndMin == null) {
      throw new Error("Tushlikning boshlanishi va tugashini to'liq kiriting.");
    }
    if (lunchEndMin <= lunchStartMin) {
      throw new Error("Tushlik tugashi boshlanishidan keyin bo'lishi kerak.");
    }
    if (lunchStartMin < workStartHour * 60 || lunchEndMin > workEndHour * 60) {
      throw new Error("Tushlik ish vaqti ichida bo'lishi kerak.");
    }
  }

  const data = {
    workStartHour,
    workEndHour,
    slotMinutes,
    workDays: workDays.join(","),
    lunchStartMin,
    lunchEndMin,
  };
  if (solo) {
    await prisma.branch.update({ where: { id: solo }, data });
  } else {
    await prisma.settings.upsert({
      where: { id: "main" },
      create: { id: "main", ...data },
      update: data,
    });
  }

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

/**
 * "Hozir zaxiralash" tugmasi.
 *
 * Cron har kuni o'zi yuboradi, lekin egasi xohlagan paytda ham olishi kerak:
 * masalan ko'p o'zgarish kiritgandan keyin yoki cron sozlanganini tekshirish
 * uchun.
 */
async function backupNowImpl() {
  await requireOwner();
  const result = await sendBackupToOwners();

  if (!result.ok) {
    throw new Error(
      result.error ?? "Zaxira yuborilmadi. Telegram bot sozlanganini tekshiring.",
    );
  }

  await setFlash("Zaxira Telegram'ga yuborildi ({n} ta yozuv).", "ok", { n: result.records });
}

/**
 * Rasm turini fayl nomi yoki brauzer aytgan turdan emas, faylning birinchi
 * baytlaridan aniqlaymiz: nomi ".png" qilib qo'yilgan boshqa fayl o'tib
 * ketmasin.
 */
function sniffImage(b: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (b.length > 8 && b[0] === 0x89 && b.toString("ascii", 1, 4) === "PNG") return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

/**
 * Logotipni kim o'zgartiradi: ega — markaznikini, yakka logoped — o'zinikini
 * (uning filialida turadi). Yakka logoped markaz logotipiga tega olmaydi.
 */
async function requireLogoOwner() {
  const user = await requireUser();
  if (user.role === "OWNER") return { soloBranchId: null as string | null };
  if (isSolo(user) && user.branchId) return { soloBranchId: user.branchId };
  throw new Error("Bu amalni faqat markaz egasi bajara oladi.");
}

/** Logotipni yuklash (menyuda va markazniki kirish sahifasida ham ko'rinadi) */
async function uploadLogoImpl(formData: FormData) {
  const { soloBranchId } = await requireLogoOwner();

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) throw new Error("Rasm faylini tanlang.");
  if (file.size > LOGO_MAX_BYTES) throw new Error("Rasm hajmi 500 KB dan oshmasin.");

  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = sniffImage(bytes);
  if (!mime) throw new Error("Faqat PNG, JPG yoki WEBP rasm yuklash mumkin.");

  const data = { logoData: bytes.toString("base64"), logoMime: mime, logoUpdatedAt: new Date() };
  if (soloBranchId) {
    await prisma.branch.update({ where: { id: soloBranchId }, data });
  } else {
    await prisma.settings.upsert({
      where: { id: "main" },
      create: { id: "main", ...data },
      update: data,
    });
  }

  // Logotip menyuda turadi — hamma sahifa yangilanishi kerak
  revalidatePath("/", "layout");
  await setFlash("Logotip saqlandi.", "ok");
}

async function removeLogoImpl() {
  const { soloBranchId } = await requireLogoOwner();
  const empty = { logoData: null, logoMime: null, logoUpdatedAt: null };
  if (soloBranchId) {
    await prisma.branch.update({ where: { id: soloBranchId }, data: empty });
  } else {
    await prisma.settings.updateMany({ where: { id: "main" }, data: empty });
  }
  revalidatePath("/", "layout");
  await setFlash("Logotip olib tashlandi.", "ok");
}


/* ---------------- Yakka logoped: o'z nomi va ma'lumoti ---------------- */

async function requireSolo() {
  const user = await requireUser();
  if (!isSolo(user) || !user.branchId) throw new Error("Sizda bu amal uchun ruxsat yo'q.");
  return { ...user, branchId: user.branchId };
}

/** Menyu tepasidagi ilova nomi ("Logoped CRM" o'rniga) */
async function updateBrandImpl(formData: FormData) {
  const user = await requireSolo();
  // Bo'sh qoldirilsa standart nom qaytadi
  const brandName = String(formData.get("brandName") ?? "").trim().slice(0, 40) || null;
  await prisma.branch.update({ where: { id: user.branchId }, data: { brandName } });
  revalidatePath("/", "layout");
  await setFlash("Ilova nomi saqlandi.", "ok");
}

/**
 * Yakka logopedning ism-familiyasi va telefoni.
 *
 * Telefon — kirish logini, shuning uchun uni almashtirishda joriy parol
 * so'raladi (ochiq qolgan telefonda boshqa odam akkauntni o'ziga olib
 * qo'ymasin). Ismni almashtirish uchun parol kerak emas.
 */
async function updateProfileImpl(formData: FormData) {
  const user = await requireSolo();

  const fullName = String(formData.get("fullName") ?? "").trim().slice(0, 80);
  const phone = String(formData.get("phone") ?? "").trim();
  if (!fullName || !phone) throw new Error("Ism va telefon majburiy.");

  const phoneChanged = phone !== user.phone;
  if (phoneChanged) {
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    const current = String(formData.get("currentPassword") ?? "");
    if (!row || !verifyPassword(current, row.passwordHash)) {
      throw new Error("Telefonni o'zgartirish uchun joriy parolni to'g'ri kiriting.");
    }
    const taken = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
    if (taken) throw new Error("Bu telefon raqam allaqachon ro'yxatda.");
  }

  const branch = await prisma.branch.findUnique({
    where: { id: user.branchId },
    select: { phone: true, name: true },
  });

  const branchData: { phone?: string; name?: string } = {};
  // Filial telefoni ro'yxatdan o'tishda logopedning raqami bo'lgan —
  // ota-onalar shu raqamga qo'ng'iroq qiladi, eskisida qolib ketmasin
  if (phoneChanged && branch?.phone === user.phone) branchData.phone = phone;
  // Filial nomi ro'yxatdan o'tishda ismdan yasalgan ("Ism (yakka)") —
  // ota-ona kabinetida ko'rinadi, eski ism qolib ketmasin. Nom yagona
  // bo'lishi shart, shuning uchun band bo'lsa raqam qo'shiladi.
  if (fullName !== user.fullName && branch?.name.startsWith(`${user.fullName} (yakka)`)) {
    const base = `${fullName} (yakka)`;
    let name = base;
    for (let i = 2; ; i++) {
      const other = await prisma.branch.findUnique({ where: { name }, select: { id: true } });
      if (!other || other.id === user.branchId) break;
      name = `${base} ${i}`;
    }
    branchData.name = name;
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { fullName, phone } }),
    ...(Object.keys(branchData).length > 0
      ? [prisma.branch.update({ where: { id: user.branchId }, data: branchData })]
      : []),
  ]);

  // Ism menyuda va hamma ro'yxatlarda turadi
  revalidatePath("/", "layout");
  await setFlash("Ma'lumotlaringiz saqlandi.", "ok");
}

/* ---------------- Google Sheets zaxirasi ---------------- */

/** Ega — markaz jadvalini, yakka logoped — o'zinikini boshqaradi */
async function requireSheetsOwner() {
  const user = await requireUser();
  if (user.role === "OWNER") return null;
  if (isSolo(user) && user.branchId) return user.branchId;
  throw new Error("Bu amalni faqat markaz egasi bajara oladi.");
}

/**
 * Jadval manzilini saqlaydi va darhol birinchi marta yozib ko'radi —
 * skript noto'g'ri joylangan bo'lsa, odam buni ertaga emas, hozir bilsin.
 */
async function saveSheetsImpl(formData: FormData) {
  const soloBranchId = await requireSheetsOwner();
  const raw = String(formData.get("sheetsUrl") ?? "").trim();
  if (raw && !SHEETS_URL_RE.test(raw)) {
    throw new Error("Manzil https://script.google.com/macros/s/.../exec ko'rinishida bo'lishi kerak.");
  }
  const data = { sheetsUrl: raw || null, sheetsError: null, sheetsSyncedAt: null };
  if (soloBranchId) {
    await prisma.branch.update({ where: { id: soloBranchId }, data });
  } else {
    await prisma.settings.upsert({ where: { id: "main" }, create: { id: "main", ...data }, update: data });
  }
  revalidatePath("/settings");
  if (!raw) {
    await setFlash("Google jadval uzildi.", "ok");
    return;
  }
  const result = await syncSheets(soloBranchId);
  if (!result.ok) throw new Error(result.error ?? "Google jadvalga yozib bo'lmadi.");
  await setFlash("Google jadval ulandi va ma'lumot yozildi.", "ok");
}

async function syncSheetsNowImpl() {
  const soloBranchId = await requireSheetsOwner();
  const result = await syncSheets(soloBranchId);
  revalidatePath("/settings");
  if (!result.ok) throw new Error(result.error ?? "Google jadvalga yozib bo'lmadi.");
  await setFlash("Ma'lumot Google jadvalga yozildi.", "ok");
}

export const saveSheets = withFlash(saveSheetsImpl);
export const syncSheetsNow = withFlash(syncSheetsNowImpl);

export const updateBrand = withFlash(updateBrandImpl);
export const updateProfile = withFlash(updateProfileImpl);

/* ---------------- Seans turlari va narxlari ---------------- */

/** Markaz turlarini ega, yakka logoped esa o'z turlarini boshqaradi */
async function requireTypeManager() {
  const user = await requireUser();
  if (user.role !== "OWNER" && !isSolo(user)) {
    throw new Error("Bu amalni faqat markaz egasi bajara oladi.");
  }
  return user;
}

function typeFields(formData: FormData, solo: boolean) {
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const price = num(formData, "price");
  if (!name) throw new Error("Xizmat nomini kiriting.");
  if (!Number.isFinite(price) || price <= 0) throw new Error("Seans narxi to'g'ri kiritilmagan.");
  // Yakka logopedda boshqa xodim yo'q — pulning hammasi o'ziniki
  if (solo) return { name, price, salaryPercent: 100 };
  const raw = String(formData.get("salaryPercent") ?? "").trim();
  const salaryPercent = Number(raw);
  if (raw === "" || !Number.isInteger(salaryPercent) || salaryPercent < 0 || salaryPercent > 100) {
    throw new Error("Ulush foizi 0 dan 100 gacha bo'lishi kerak.");
  }
  return { name, price, salaryPercent };
}

/** Boshqa markazning (yoki yakka logopedning) turiga tegib bo'lmasin */
async function ownType(formData: FormData) {
  const user = await requireTypeManager();
  return { user, id: await ownTypeId(user, formData) };
}

async function ownTypeId(user: Awaited<ReturnType<typeof requireUser>>, formData: FormData) {
  const id = String(formData.get("typeId") ?? "");
  const type = await prisma.sessionType.findFirst({
    where: { id, ...sessionTypeScope(user) },
    select: { id: true },
  });
  if (!type) throw new Error("Xizmat topilmadi.");
  return type.id;
}

function refreshTypes() {
  revalidatePath("/settings");
  revalidatePath("/schedule");
  revalidatePath("/slots");
}

async function addSessionTypeImpl(formData: FormData) {
  const user = await requireTypeManager();
  const { name, price, salaryPercent } = typeFields(formData, isSolo(user));
  const scope = sessionTypeScope(user);
  const clash = await prisma.sessionType.findFirst({
    where: { ...scope, isActive: true, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (clash) throw new Error("Bunday nomli xizmat allaqachon bor.");
  await prisma.sessionType.create({ data: { ...scope, name, price, salaryPercent } });
  refreshTypes();
  await setFlash("Xizmat qo'shildi.", "ok");
}

/**
 * Narx o'zgarsa faqat yangi seanslarga ta'sir qiladi: o'tib bo'lgan seans
 * narxi "O'tdi" belgilangan payt seansning o'ziga yozilgan.
 */
async function updateSessionTypeImpl(formData: FormData) {
  const { user, id } = await ownType(formData);
  const data = typeFields(formData, isSolo(user));
  await prisma.sessionType.update({ where: { id }, data });
  refreshTypes();
  await setFlash("Xizmat saqlandi.", "ok");
}

/**
 * Butunlay o'chirilmaydi, ro'yxatdan olinadi: eski seanslarda tur nomi
 * ko'rinib tursin, hisobotlar o'zgarmasin.
 */
async function removeSessionTypeImpl(formData: FormData) {
  const { id } = await ownType(formData);
  await prisma.sessionType.update({ where: { id }, data: { isActive: false } });
  refreshTypes();
  await setFlash("Xizmat ro'yxatdan olindi.", "ok");
}

export const addSessionType = withFlash(addSessionTypeImpl);
export const updateSessionType = withFlash(updateSessionTypeImpl);
export const removeSessionType = withFlash(removeSessionTypeImpl);

/**
 * "@kanal", "kanal", "t.me/kanal" — hammasi "@kanal" ga keltiriladi.
 * Yopiq kanalning username'i yo'q, uning raqami (-100...) o'zicha qoladi.
 */
function channelId(raw: string): string {
  const v = raw.trim().replace(/^https?:\/\//, "").replace(/^t\.me\//, "").replace(/\/+$/, "");
  if (/^-?\d+$/.test(v)) return v;
  return `@${v.replace(/^@/, "")}`;
}

/** Ota-onalar kanaliga bot nomidan "Kabinetni ochish" tugmali e'lon */
async function postChannelImpl(formData: FormData) {
  const user = await requireUser();
  // Kanal — markazning yuzi: uni ega yoki o'ziga o'zi rahbar yakka logoped boshqaradi
  if (user.role !== "OWNER" && !isSolo(user)) {
    throw new Error("Bu amalni faqat markaz egasi bajara oladi.");
  }

  const chat = String(formData.get("channel") ?? "").trim();
  const text = String(formData.get("text") ?? "").trim();
  const buttonText = String(formData.get("buttonText") ?? "").trim() || "📱 Kabinetni ochish";
  if (!chat) throw new Error("Kanal nomini kiriting, masalan @markaz_kanali.");
  if (!text) throw new Error("E'lon matni bo'sh.");
  if (text.length > 4000) throw new Error("E'lon matni juda uzun (4000 belgigacha).");

  const res = await postToChannel({
    chat: channelId(chat),
    text,
    buttonText: buttonText.slice(0, 60),
    pin: formData.get("pin") === "on",
  });

  if (!res.ok) {
    const e = res.error.toLowerCase();
    if (e.includes("token")) throw new Error("Telegram bot sozlanmagan — TELEGRAM_BOT_TOKEN qo'yilmagan.");
    if (e.includes("chat not found")) {
      throw new Error("Kanal topilmadi. Nomini va botning kanalga admin qilib qo'shilganini tekshiring.");
    }
    if (e.includes("rights") || e.includes("not a member") || e.includes("forbidden")) {
      throw new Error("Bot kanalda admin emas yoki xabar joylash huquqi yo'q.");
    }
    if (e.includes("unauthorized") || e.includes("not found")) {
      throw new Error("Telegram bot topilmadi — TELEGRAM_BOT_TOKEN noto'g'ri.");
    }
    throw new ActionError("Telegram e'lonni qabul qilmadi: {error}", { error: res.error });
  }

  await setFlash(
    res.pinned || formData.get("pin") !== "on"
      ? "E'lon kanalga joylandi."
      : "E'lon joylandi, lekin qadab bo'lmadi — botga \"Xabarlarni qadash\" huquqini bering.",
    "ok",
  );
}

export const postChannel = withFlash(postChannelImpl);
export const uploadLogo = withFlash(uploadLogoImpl);
export const removeLogo = withFlash(removeLogoImpl);
export const backupNow = withFlash(backupNowImpl);
export const updateCenter = withFlash(updateCenterImpl);
export const updateWorkHours = withFlash(updateWorkHoursImpl);
export const changePassword = withFlash(changePasswordImpl);

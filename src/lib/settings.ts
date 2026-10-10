import "server-only";
import { prisma } from "@/lib/prisma";

export type CenterSettings = {
  centerName: string;
  centerPhone: string | null;
  defaultPrice: number;
  defaultSalaryPercent: number;
  workStartHour: number;
  workEndHour: number;
  slotMinutes: number;
  /** 1 = dushanba ... 7 = yakshanba */
  workDays: number[];
  /** Tushlik, kun boshidan daqiqada; ikkalasi ham null — tushliksiz */
  lunchStartMin: number | null;
  lunchEndMin: number | null;
  /** Google Sheets zaxirasi (markazniki) */
  sheetsUrl: string | null;
  sheetsSyncedAt: Date | null;
  sheetsError: string | null;
  /** Logotip yuklangan bo'lsa — uning manzili (versiya bilan), aks holda null */
  logoUrl: string | null;
  /** Yakka mutaxassis ro'yxatdan o'tishi uchun kod. Bo'sh bo'lsa — yopiq */
  soloInviteCode: string | null;
};

const DEFAULTS: CenterSettings = {
  centerName: "Logopedik markaz",
  centerPhone: null,
  defaultPrice: 150_000,
  defaultSalaryPercent: 40,
  workStartHour: 9,
  workEndHour: 18,
  slotMinutes: 60,
  workDays: [1, 2, 3, 4, 5, 6],
  lunchStartMin: null,
  lunchEndMin: null,
  sheetsUrl: null,
  sheetsSyncedAt: null,
  sheetsError: null,
  logoUrl: null,
  soloInviteCode: null,
};

export const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "Dushanba" },
  { value: 2, label: "Seshanba" },
  { value: 3, label: "Chorshanba" },
  { value: 4, label: "Payshanba" },
  { value: 5, label: "Juma" },
  { value: 6, label: "Shanba" },
  { value: 7, label: "Yakshanba" },
];

/**
 * Markaz sozlamalari.
 *
 * Bazada doim bitta qator bo'ladi. Hali yozilmagan bo'lsa (eski markaz yoki
 * yangi baza), standart qiymatlar qaytariladi — sahifalar sozlama yo'qligi
 * sababli ishlamay qolmasin.
 */
export async function getSettings(): Promise<CenterSettings> {
  // Rasmning o'zi (logoData) bu yerda o'qilmaydi: getSettings har sahifada
  // chaqiriladi, rasm esa alohida manzildan, brauzer keshi bilan olinadi.
  const row = await prisma.settings.findUnique({
    where: { id: "main" },
    omit: { logoData: true },
  });
  if (!row) return DEFAULTS;

  const workDays = parseWorkDays(row.workDays);

  return {
    centerName: row.centerName,
    centerPhone: row.centerPhone,
    defaultPrice: row.defaultPrice,
    defaultSalaryPercent: row.defaultSalaryPercent,
    workStartHour: row.workStartHour,
    workEndHour: row.workEndHour,
    slotMinutes: row.slotMinutes,
    workDays: workDays.length > 0 ? workDays : DEFAULTS.workDays,
    lunchStartMin: row.lunchStartMin,
    lunchEndMin: row.lunchEndMin,
    sheetsUrl: row.sheetsUrl,
    sheetsSyncedAt: row.sheetsSyncedAt,
    sheetsError: row.sheetsError,
    logoUrl: row.logoUpdatedAt && row.logoMime ? `/api/logo?v=${row.logoUpdatedAt.getTime()}` : null,
    soloInviteCode: row.soloInviteCode,
  };
}

/* ---------- Logotip ---------- */

/** Faqat shu turlar qabul qilinadi. SVG ataylab yo'q: ichida skript bo'lishi mumkin */
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const LOGO_MAX_BYTES = 500 * 1024;

export async function getLogo(): Promise<{ data: Buffer; mime: string } | null> {
  const row = await prisma.settings.findUnique({
    where: { id: "main" },
    select: { logoData: true, logoMime: true },
  });
  if (!row?.logoData || !row.logoMime) return null;
  return { data: Buffer.from(row.logoData, "base64"), mime: row.logoMime };
}

/** Yakka logopedning o'z logotipi. Markaz filiallarida bunday narsa yo'q */
export async function getBranchLogo(branchId: string): Promise<{ data: Buffer; mime: string } | null> {
  const row = await prisma.branch.findFirst({
    where: { id: branchId, isSolo: true },
    select: { logoData: true, logoMime: true },
  });
  if (!row?.logoData || !row.logoMime) return null;
  return { data: Buffer.from(row.logoData, "base64"), mime: row.logoMime };
}

function parseWorkDays(raw: string): number[] {
  return raw
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
}

/* ---------- Ish vaqti ---------- */

export type WorkHours = Pick<
  CenterSettings,
  "workStartHour" | "workEndHour" | "slotMinutes" | "workDays" | "lunchStartMin" | "lunchEndMin"
>;

/**
 * Kimning ish vaqti bo'yicha bo'sh vaqtlar hisoblanadi.
 *
 * Yakka logopedning o'z ish vaqti bor (filialida) — markaz ish vaqti unga
 * tegishli emas. U hali o'zinikini kiritmagan bo'lsa, markaznikiga tushadi.
 * Markaz filiallari hozircha bitta umumiy ish vaqtida ishlaydi.
 */
export async function getWorkHours(soloBranchId?: string | null): Promise<WorkHours> {
  const [center, branch] = await Promise.all([
    getSettings(),
    soloBranchId
      ? prisma.branch.findFirst({
          where: { id: soloBranchId, isSolo: true },
          select: {
            workStartHour: true,
            workEndHour: true,
            slotMinutes: true,
            workDays: true,
            lunchStartMin: true,
            lunchEndMin: true,
          },
        })
      : Promise.resolve(null),
  ]);
  // Yakka logoped ish vaqtini bir martada (formadan) saqlaydi — boshlanishi
  // yozilgan bo'lsa qolgani ham yozilgan
  if (branch?.workStartHour == null) {
    const { workStartHour, workEndHour, slotMinutes, workDays, lunchStartMin, lunchEndMin } = center;
    return { workStartHour, workEndHour, slotMinutes, workDays, lunchStartMin, lunchEndMin };
  }
  const days = parseWorkDays(branch.workDays ?? "");
  return {
    workStartHour: branch.workStartHour,
    workEndHour: branch.workEndHour ?? center.workEndHour,
    slotMinutes: branch.slotMinutes ?? center.slotMinutes,
    workDays: days.length > 0 ? days : center.workDays,
    lunchStartMin: branch.lunchStartMin,
    lunchEndMin: branch.lunchEndMin,
  };
}

/** 780 -> "13:00" (time maydoni va sarlavhalar uchun) */
export function minutesToTime(min: number | null): string {
  if (min == null) return "";
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Sana ish kunimi (1=dushanba ... 7=yakshanba) */
export function isWorkDay(date: Date, workDays: number[]): boolean {
  const iso = date.getDay() === 0 ? 7 : date.getDay();
  return workDays.includes(iso);
}

/**
 * Shu kun uchun ish vaqtidagi barcha boshlanish vaqtlari.
 *
 * Tushlikka to'g'ri keladigan (unga qisman kirib qoladigan ham) vaqt
 * taklif qilinmaydi: 12:30 dagi soatlik seans 13:00 dagi tushlikni yeydi.
 */
export function daySlots(date: Date, s: WorkHours): Date[] {
  const out: Date[] = [];
  if (!isWorkDay(date, s.workDays)) return out;

  const step = Math.max(s.slotMinutes, 5);
  const start = new Date(date);
  start.setHours(s.workStartHour, 0, 0, 0);
  const end = new Date(date);
  end.setHours(s.workEndHour, 0, 0, 0);

  const lunch =
    s.lunchStartMin != null && s.lunchEndMin != null && s.lunchEndMin > s.lunchStartMin
      ? { from: s.lunchStartMin, to: s.lunchEndMin }
      : null;

  for (let t = new Date(start); t < end; t = new Date(t.getTime() + step * 60_000)) {
    if (lunch) {
      const m = t.getHours() * 60 + t.getMinutes();
      if (m < lunch.to && m + step > lunch.from) continue;
    }
    out.push(new Date(t));
  }
  return out;
}

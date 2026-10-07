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
  /** Logotip yuklangan bo'lsa — uning manzili (versiya bilan), aks holda null */
  logoUrl: string | null;
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
  logoUrl: null,
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

  const workDays = row.workDays
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);

  return {
    centerName: row.centerName,
    centerPhone: row.centerPhone,
    defaultPrice: row.defaultPrice,
    defaultSalaryPercent: row.defaultSalaryPercent,
    workStartHour: row.workStartHour,
    workEndHour: row.workEndHour,
    slotMinutes: row.slotMinutes,
    workDays: workDays.length > 0 ? workDays : DEFAULTS.workDays,
    logoUrl: row.logoUpdatedAt && row.logoMime ? `/api/logo?v=${row.logoUpdatedAt.getTime()}` : null,
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

/** Sana ish kunimi (1=dushanba ... 7=yakshanba) */
export function isWorkDay(date: Date, workDays: number[]): boolean {
  const iso = date.getDay() === 0 ? 7 : date.getDay();
  return workDays.includes(iso);
}

/** Shu kun uchun ish vaqtidagi barcha boshlanish vaqtlari */
export function daySlots(date: Date, s: CenterSettings): Date[] {
  const out: Date[] = [];
  if (!isWorkDay(date, s.workDays)) return out;

  const step = Math.max(s.slotMinutes, 5);
  const start = new Date(date);
  start.setHours(s.workStartHour, 0, 0, 0);
  const end = new Date(date);
  end.setHours(s.workEndHour, 0, 0, 0);

  for (let t = new Date(start); t < end; t = new Date(t.getTime() + step * 60_000)) {
    out.push(new Date(t));
  }
  return out;
}

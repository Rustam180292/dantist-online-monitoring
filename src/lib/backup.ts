import "server-only";
import { prisma } from "@/lib/prisma";
import { TABLES } from "../../prisma/tables";

export type BackupFile = {
  takenAt: string;
  /** Parol xeshlari olib tashlanganmi (Telegram'ga yuboriladigan nusxada — ha) */
  withoutPasswords?: boolean;
  tables: Record<string, unknown[]>;
};

/**
 * Bazadagi hamma jadvalni o'qib, zaxira obyektini qaytaradi.
 *
 * `withPasswords: false` bo'lsa parol xeshlari olib tashlanadi. Telegram'ga
 * yuboriladigan nusxa uchun shunday qilinadi: fayl suhbatda qolib ketadi va
 * uni boshqa qurilmalar ham yuklab oladi. Bunday nusxadan tiklansa,
 * foydalanuvchilarga parol qaytadan qo'yiladi.
 */
export async function collectBackup(opts: { withPasswords: boolean }): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {};

  for (const { name, delegate } of TABLES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: Record<string, unknown>[] = await (prisma as any)[delegate].findMany();
    tables[name] =
      name === "User" && !opts.withPasswords
        ? rows.map((r) => ({ ...r, passwordHash: "" }))
        : rows;
  }

  return {
    takenAt: new Date().toISOString(),
    ...(opts.withPasswords ? {} : { withoutPasswords: true }),
    tables,
  };
}

/** Zaxirada nechta yozuv borligi */
export function backupTotal(file: BackupFile): number {
  return Object.values(file.tables).reduce((n, rows) => n + rows.length, 0);
}

/** Fayl nomi: zaxira-2026-10-07-0930.json */
export function backupFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `zaxira-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

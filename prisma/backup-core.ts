/**
 * Zaxira olishning o'zagi.
 *
 * Alohida faylda, chunki uni ikki joy ishlatadi: `db:backup` buyrug'i va
 * `db:clean` (bazani tozalashdan oldin o'zi zaxira oladi).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { PrismaClient } from "../src/generated/prisma";
import { TABLES } from "./tables";

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** Hamma jadvalni JSON faylga yozadi va fayl manzilini qaytaradi */
export async function writeBackup(
  prisma: PrismaClient,
  opts: { quiet?: boolean; suffix?: string } = {},
): Promise<{ file: string; total: number }> {
  const tables: Record<string, unknown[]> = {};

  for (const { name, delegate } of TABLES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma as any)[delegate].findMany();
    tables[name] = rows;
    if (!opts.quiet) console.log(`  ${name}: ${rows.length}`);
  }

  const dir = path.join(process.cwd(), "zaxira");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `zaxira-${stamp()}${opts.suffix ?? ""}.json`);
  writeFileSync(file, JSON.stringify({ takenAt: new Date().toISOString(), tables }, null, 1));

  const total = Object.values(tables).reduce((n, rows) => n + rows.length, 0);
  return { file, total };
}

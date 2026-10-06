/**
 * Bazaning to'liq zaxira nusxasi.
 *
 * Ishga tushirish:  npm run db:backup
 * Natija:           zaxira/zaxira-2026-10-06-1530.json
 *
 * Nega pg_dump emas: pg_dump alohida o'rnatilishi kerak va har kimda bo'lavermaydi.
 * Bu skript loyihaning o'zidagi vositalar bilan ishlaydi — qo'shimcha hech narsa
 * kerak emas. Fayl oddiy JSON, ya'ni ichini ochib ko'rish ham mumkin.
 *
 * DIQQAT: faylda bolalar va ota-onalarning shaxsiy ma'lumoti bo'ladi. Uni
 * ommaga ochiq joyga qo'ymang. `zaxira/` papkasi git'ga tushmaydi.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";
import { TABLES } from "./tables";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL sozlanmagan (.env faylini tekshiring).");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

async function main() {
  const tables: Record<string, unknown[]> = {};

  for (const { name, delegate } of TABLES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma as any)[delegate].findMany();
    tables[name] = rows;
    console.log(`  ${name}: ${rows.length}`);
  }

  const dir = path.join(process.cwd(), "zaxira");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `zaxira-${stamp()}.json`);
  writeFileSync(file, JSON.stringify({ takenAt: new Date().toISOString(), tables }, null, 1));

  const total = Object.values(tables).reduce((n, rows) => n + rows.length, 0);
  console.log(`\nZaxira tayyor: ${file}`);
  console.log(`Jami ${total} ta yozuv.`);
  console.log(`\nShu faylni boshqa joyga ham ko'chirib qo'ying (iCloud, tashqi disk).`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

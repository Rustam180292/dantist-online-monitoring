/**
 * Zaxira nusxadan tiklash.
 *
 * Ishga tushirish:  npm run db:restore -- zaxira/zaxira-2026-10-06-1530.json
 *
 * DIQQAT: bu skript bazadagi hozirgi ma'lumotni o'chirib, fayldagisini yozadi.
 * Shuning uchun seed'dagi kabi to'siq bor: baza bo'sh bo'lmasa va lokal bo'lmasa,
 * skript o'zi to'xtaydi.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";
import { TABLES } from "./tables";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL sozlanmagan (.env faylini tekshiring).");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const CONFIRM = "hammasini-ochirishga-roziman";
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** JSON sanalarni matn qilib saqlaydi — ularni qaytadan Date ga aylantiramiz */
function reviver(_key: string, value: unknown): unknown {
  return typeof value === "string" && ISO.test(value) ? new Date(value) : value;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

async function assertSafeToWipe() {
  const [clients, sessions, payments] = await Promise.all([
    prisma.client.count(),
    prisma.session.count(),
    prisma.payment.count(),
  ]);
  if (clients === 0 && sessions === 0 && payments === 0) return;

  const host = hostOf(connectionString!);
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return;
  if (process.env.RESTORE_CONFIRM === CONFIRM) {
    console.log(`DIQQAT: ${host} dagi ma'lumot ustiga yozilmoqda.`);
    return;
  }

  throw new Error(
    `To'xtatildi: "${host}" bazasida ma'lumot bor va u lokal emas.\n` +
      `  Mijozlar: ${clients}, seanslar: ${sessions}, to'lovlar: ${payments}\n\n` +
      `Tiklash ularning hammasini fayldagi holat bilan almashtiradi.\n` +
      `Avval hozirgi holatning zaxirasini oling:  npm run db:backup\n` +
      `keyin shunday ishga tushiring:\n` +
      `  RESTORE_CONFIRM=${CONFIRM} npm run db:restore -- <fayl>`,
  );
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Fayl ko'rsatilmadi.\n  npm run db:restore -- zaxira/zaxira-....json");

  const data = JSON.parse(readFileSync(file, "utf8"), reviver) as {
    takenAt?: string;
    tables: Record<string, Record<string, unknown>[]>;
  };
  if (!data?.tables) throw new Error("Fayl noto'g'ri: ichida 'tables' yo'q.");

  await assertSafeToWipe();

  console.log("Hozirgi ma'lumot tozalanmoqda...");
  for (const { delegate } of [...TABLES].reverse()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any)[delegate].deleteMany();
  }

  console.log("Zaxiradan tiklanmoqda...");
  for (const { name, delegate } of TABLES) {
    const rows = data.tables[name] ?? [];
    if (rows.length === 0) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any)[delegate].createMany({ data: rows });
    console.log(`  ${name}: ${rows.length}`);
  }

  console.log("\nTiklandi.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

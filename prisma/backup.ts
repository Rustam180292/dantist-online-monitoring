/**
 * Bazaning to'liq zaxira nusxasi.
 *
 * Ishga tushirish:  npm run db:backup
 * Natija:           zaxira/zaxira-2026-10-06-1530.json
 *
 * Nega pg_dump emas: pg_dump alohida o'rnatilishi kerak va har kimda
 * bo'lavermaydi. Bu skript loyihaning o'z vositalari bilan ishlaydi.
 *
 * DIQQAT: faylda bolalar va ota-onalarning shaxsiy ma'lumoti bo'ladi. Uni
 * ommaga ochiq joyga qo'ymang. `zaxira/` papkasi git'ga tushmaydi.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";
import { writeBackup } from "./backup-core";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL sozlanmagan (.env faylini tekshiring).");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const { file, total } = await writeBackup(prisma);
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

/**
 * Bir martalik: jadvaldagi vaqtlarni markaz vaqt zonasiga ko'chiradi.
 *
 * Ishga tushirish:  npm run db:timezone
 *
 * NEGA KERAK. Ilgari server UTC da ishlardi: xodim "09:00" deb kiritsa, baza
 * 09:00 UTC deb yozib qo'yardi va ekranda ham 09:00 ko'rinardi — ikkalasi bir
 * xil adashgani uchun hech narsa sezilmasdi. Endi server Toshkent vaqtida
 * ishlaydi, ya'ni eski yozuvlar 5 soat keyin ko'rina boshlaydi. Shuning uchun
 * ularni bir marta orqaga suramiz.
 *
 * Faqat odam qo'lda kiritgan vaqtlar suriladi: seansning boshlanishi va
 * qabulning vaqti. `createdAt`, `paidAt` kabi maydonlar haqiqiy lahzani
 * bildiradi — ular to'g'ri yozilgan, tegilmaydi. Sana-kunlik maydonlar
 * (tug'ilgan sana, abonement sanasi) yarim tunda UTC bo'lib turadi va
 * ikkala zonada ham o'sha kunni ko'rsatadi — ularga ham tegilmaydi.
 */
import "dotenv/config";
import { createInterface } from "node:readline";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";
import { CENTER_TZ } from "../src/instrumentation";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL sozlanmagan (.env faylini tekshiring).");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const CONFIRM = "vaqtlarni-surish";

/** Markaz zonasi UTC dan necha daqiqa oldinda (Toshkent uchun +300) */
function offsetMinutes(at: Date, timeZone: string): number {
  // Bitta lahzani ikki zonada "yozib", farqini o'lchaymiz
  const asUtc = new Date(at.toLocaleString("en-US", { timeZone: "UTC" }));
  const asLocal = new Date(at.toLocaleString("en-US", { timeZone }));
  return Math.round((asLocal.getTime() - asUtc.getTime()) / 60_000);
}

function fmt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  process.stdout.write(question);
  for await (const line of rl[Symbol.asyncIterator]()) {
    rl.close();
    return line.trim();
  }
  rl.close();
  return "";
}

async function main() {
  const tz = process.env.CENTER_TZ || CENTER_TZ;
  const minutes = offsetMinutes(new Date(), tz);
  if (minutes === 0) {
    console.log(`${tz} UTC bilan bir xil — surish kerak emas.`);
    return;
  }

  const settings = await prisma.settings.findUnique({ where: { id: "main" } });
  if (settings?.timezoneShiftedAt) {
    console.log(
      `Bu skript allaqachon ishlagan (${settings.timezoneShiftedAt.toISOString()}).\n` +
        "Ikki marta ishlatilsa vaqtlar ikki barobar siljib ketadi, shuning uchun to'xtadik.",
    );
    return;
  }

  const [sessions, intakes] = await Promise.all([
    prisma.session.count(),
    prisma.intake.count({ where: { scheduledAt: { not: undefined } } }),
  ]);
  const sample = await prisma.session.findFirst({
    orderBy: { startsAt: "desc" },
    select: { startsAt: true },
  });

  console.log(`Markaz zonasi: ${tz} (UTC${minutes > 0 ? "+" : ""}${minutes / 60})`);
  console.log(`Suriladi: ${sessions} ta seans, ${intakes} ta qabul — har biri ${minutes} daqiqa orqaga.`);
  if (sample) {
    const after = new Date(sample.startsAt.getTime() - minutes * 60_000);
    console.log(`Masalan: ${fmt(sample.startsAt)}  ->  ${fmt(after)}`);
    console.log("Ekranda ko'rinadigan soat o'zgarmaydi — shuning uchun suryapmiz.");
  }
  console.log("\nAvval zaxira oling: npm run db:backup");
  const answer = await ask(`Davom etish uchun "${CONFIRM}" deb yozing: `);
  if (answer !== CONFIRM) {
    console.log("To'xtatildi, hech narsa o'zgarmadi.");
    return;
  }

  await prisma.$transaction([
    prisma.$executeRaw`UPDATE "Session" SET "startsAt" = "startsAt" - make_interval(mins => ${minutes})`,
    prisma.$executeRaw`UPDATE "Intake" SET "scheduledAt" = "scheduledAt" - make_interval(mins => ${minutes})`,
    prisma.settings.upsert({
      where: { id: "main" },
      create: { id: "main", timezoneShiftedAt: new Date() },
      update: { timezoneShiftedAt: new Date() },
    }),
  ]);

  console.log(`\nTayyor. ${sessions} ta seans va ${intakes} ta qabul ko'chirildi.`);
  console.log("Endi jadvalni ochib, vaqtlar o'z joyida turganini tekshiring.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

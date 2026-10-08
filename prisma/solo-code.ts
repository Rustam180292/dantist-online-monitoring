/**
 * Yakka mutaxassislar uchun taklif kodini qo'yadi yoki o'chiradi.
 *
 *   npm run db:solo-code -- LOGO-2026     # kodni qo'yadi, ro'yxatdan o'tish ochiladi
 *   npm run db:solo-code -- --yop         # kodni o'chiradi, ro'yxatdan o'tish yopiladi
 *   npm run db:solo-code                  # hozirgi holatni ko'rsatadi
 *
 * Nega markaz sozlamalarida emas, terminalda: yakka mutaxassis markazga
 * tegishli emas — markaz rahbari uni ko'rmaydi ham, boshqarmaydi ham. Kodni
 * ilovani sotayotgan odam (ya'ni biz) beradi.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL sozlanmagan (.env faylini tekshiring).");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
const link = appUrl ? `${appUrl}/royxat` : "/royxat";

async function main() {
  const arg = (process.argv[2] ?? "").trim();
  const current = await prisma.settings.findUnique({
    where: { id: "main" },
    select: { soloInviteCode: true },
  });

  if (!arg) {
    const code = current?.soloInviteCode?.trim();
    console.log(
      code
        ? `Ro'yxatdan o'tish ochiq.\n  Kod:    ${code}\n  Havola: ${link}`
        : `Ro'yxatdan o'tish yopiq (kod qo'yilmagan).\n  Ochish: npm run db:solo-code -- <kod>`,
    );
    return;
  }

  const close = arg === "--yop" || arg === "--close";
  if (!close && arg.length < 4) throw new Error("Kod kamida 4 belgidan bo'lsin.");

  const code = close ? null : arg;
  await prisma.settings.upsert({
    where: { id: "main" },
    create: { id: "main", soloInviteCode: code },
    update: { soloInviteCode: code },
  });

  console.log(
    close
      ? "Ro'yxatdan o'tish yopildi — yangi yakka mutaxassis akkaunt ocholmaydi."
      : `Kod qo'yildi: ${code}\nMutaxassisga shu havolani bering: ${link}`,
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

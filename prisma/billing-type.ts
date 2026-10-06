/**
 * Bir martalik: mavjud mijozlarga to'lov turini qo'yib chiqadi.
 *
 * Ishga tushirish:  npm run db:billing-type
 *
 * `billingType` ustuni yangi qo'shildi va standarti "DAILY". Lekin bazadagi eski
 * mijozlarning ko'pida abonement bor — ular "kunlik" bo'lib qolib ketmasligi
 * uchun abonementi borlarni "PACKAGE" ga o'tkazamiz. Abonementi yo'qlari
 * kunlikligicha qoladi.
 *
 * Skript bir necha marta ishlatilsa ham zarar qilmaydi: faqat hali DAILY turgan
 * va abonementi bor mijozlarga tegadi, qo'lda o'zgartirilganini buzmaydi.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL sozlanmagan (.env faylini tekshiring).");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const withPackages = await prisma.client.findMany({
    where: { billingType: "DAILY", packages: { some: {} } },
    select: { id: true },
  });

  if (withPackages.length === 0) {
    console.log("O'zgartiradigan mijoz yo'q — hammasining turi o'rnida.");
    return;
  }

  const { count } = await prisma.client.updateMany({
    where: { id: { in: withPackages.map((c) => c.id) } },
    data: { billingType: "PACKAGE" },
  });

  const total = await prisma.client.count();
  const daily = await prisma.client.count({ where: { billingType: "DAILY" } });
  console.log(`${count} ta mijoz "Abonement" qilib belgilandi.`);
  console.log(`Jami ${total} ta mijoz: ${daily} ta kunlik, ${total - daily} ta abonement.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

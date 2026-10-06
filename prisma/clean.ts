/**
 * Haqiqiy ishga o'tish: demo ma'lumotni tozalab, markazning o'z akkauntini ochish.
 *
 * Ishga tushirish:  npm run db:clean
 *
 * Nega kerak: ilova demo ma'lumot bilan yetkaziladi — o'ylab topilgan filiallar,
 * mutaxassislar, mijozlar va hammasining paroli bir xil. Haqiqiy markaz ishni
 * boshlashdan oldin ularning hammasi yo'qolishi va o'rniga faqat bitta narsa
 * qolishi kerak: markazning o'z filiali va eganing o'z akkaunti.
 *
 * Skript savol berib boradi, oldin o'zi zaxira oladi va oxirida tasdiq so'raydi.
 */
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";
import { hashPassword } from "./seed-hash";
import { writeBackup } from "./backup-core";
import { TABLES } from "./tables";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL sozlanmagan (.env faylini tekshiring).");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const CONFIRM_WORD = "TOZALASH";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "(noma'lum)";
  }
}

async function main() {
  /**
   * Savol-javob.
   *
   * `rl.question()` o'rniga qatorlar oqimidan o'qiymiz: shunda skriptni
   * tayyor javoblar bilan ham ishga tushirish mumkin bo'ladi (sinov uchun),
   * terminalda esa odatdagidek savol berib boraveradi.
   */
  const rl = createInterface({ input: process.stdin });
  const lines = rl[Symbol.asyncIterator]();

  const ask = async (question: string, required = true): Promise<string> => {
    for (;;) {
      process.stdout.write(question);
      const { value, done } = await lines.next();
      if (done) throw new Error("Kiritish to'xtadi — bekor qilindi.");
      const answer = String(value).trim();
      if (answer || !required) {
        process.stdout.write("\n");
        return answer;
      }
      process.stdout.write("\n  Bu qator majburiy.\n");
    }
  };

  try {
    const [branches, users, clients, sessions, payments] = await Promise.all([
      prisma.branch.count(),
      prisma.user.count(),
      prisma.client.count(),
      prisma.session.count(),
      prisma.payment.count(),
    ]);

    console.log(`\nBaza: ${hostOf(connectionString!)}`);
    console.log(`Hozir bazada: ${branches} filial, ${users} foydalanuvchi, ${clients} mijoz, `
      + `${sessions} seans, ${payments} to'lov.`);
    console.log("\nShu ma'lumotning HAMMASI o'chiriladi va o'rniga bitta filial bilan");
    console.log("bitta egalik akkaunti yaratiladi.\n");

    // Markaz ma'lumotlari
    const branchName = await ask("Filial nomi (masalan: Chilonzor filiali): ");
    const branchAddress = await ask("Filial manzili (ixtiyoriy, Enter bosing): ", false);
    const branchPhone = await ask("Filial telefoni (ixtiyoriy, Enter bosing): ", false);

    // Egasi
    console.log("");
    const fullName = await ask("Egasining F.I.Sh.: ");
    let phone = "";
    for (;;) {
      phone = await ask("Egasining telefoni (login, masalan +998901234567): ");
      if (/^\+?\d{9,15}$/.test(phone)) break;
      console.log("  Telefon raqam noto'g'ri. Masalan: +998901234567");
    }
    let password = "";
    for (;;) {
      password = await ask("Parol (kamida 6 belgi): ");
      if (password.length < 6) {
        console.log("  Parol juda qisqa.");
        continue;
      }
      if (password === "parol123") {
        console.log("  Bu demo parol — boshqasini tanlang.");
        continue;
      }
      break;
    }

    // Zaxira — tozalashdan oldin, so'ramasdan
    console.log("\nAvval zaxira olinmoqda...");
    const { file, total } = await writeBackup(prisma, { quiet: true, suffix: "-tozalashdan-oldin" });
    console.log(`  Zaxira: ${file} (${total} ta yozuv)`);

    // Oxirgi tasdiq
    console.log("");
    const confirm = await ask(`Davom etish uchun "${CONFIRM_WORD}" deb yozing: `);
    if (confirm !== CONFIRM_WORD) {
      console.log("\nBekor qilindi. Bazaga tegilmadi.");
      return;
    }

    console.log("\nTozalanmoqda...");
    for (const { delegate } of [...TABLES].reverse()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any)[delegate].deleteMany();
    }

    const branch = await prisma.branch.create({
      data: {
        name: branchName,
        address: branchAddress || null,
        phone: branchPhone || null,
      },
    });

    await prisma.user.create({
      data: {
        phone,
        fullName,
        passwordHash: hashPassword(password),
        role: "OWNER",
        branchId: null,
      },
    });

    console.log("\nTayyor. Baza endi bo'sh, faqat quyidagilar bor:");
    console.log(`  Filial:  ${branch.name}`);
    console.log(`  Egasi:   ${fullName} — ${phone}`);
    console.log("\nKeyingi qadamlar:");
    console.log("  1. Saytga shu telefon va parol bilan kiring");
    console.log("  2. Xodimlar bo'limidan mutaxassislarni qo'shing");
    console.log("  3. Mijozlarni kiriting");
    console.log("\nServerda DEMO_LOGINS o'zgaruvchisi bo'lsa, uni olib tashlang.");
  } finally {
    rl.close();
  }
}

main()
  .catch((e) => {
    console.error(`\n${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

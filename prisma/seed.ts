/**
 * Demo ma'lumotlar: 2 filial, har birida 5 mutaxassis, har mutaxassisning o'z mijozlari,
 * 6 haftalik jadval (o'tgan haftalar davomat bilan), abonementlar va to'lovlar.
 *
 * Ishga tushirish:  npm run db:seed   (yoki npm run db:reset)
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";
import { hashPassword } from "./seed-hash";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL sozlanmagan (.env faylini tekshiring).");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** Takrorlanadigan natija uchun oddiy generator */
let seedState = 20260401;
function rnd(): number {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState / 2147483648;
}
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const chance = (p: number) => rnd() < p;

const DEMO_PASSWORD = "parol123";

const PRICE: Record<string, number> = {
  ABA: 150_000,
  LOGOPED: 120_000,
  AFK: 100_000,
  MASSAGE: 80_000,
  PSYCHOLOGIST: 130_000,
  SENSORY: 110_000,
};

const BRANCHES = [
  {
    name: "Chilonzor filiali",
    address: "Toshkent, Chilonzor tumani, Bunyodkor shoh ko'chasi 12",
    phone: "+998 71 200 10 10",
    admin: { fullName: "Nilufar Qosimova", phone: "+998901110011" },
    reception: { fullName: "Shahnoza Rajabova", phone: "+998901110012" },
    specialists: [
      { fullName: "Dilnoza Rahimova", phone: "+998901110101", specialization: "ABA", salaryPercent: 45 },
      { fullName: "Gulnora Yusupova", phone: "+998901110102", specialization: "LOGOPED", salaryPercent: 45 },
      { fullName: "Bekzod Ergashev", phone: "+998901110103", specialization: "AFK", salaryPercent: 40 },
      { fullName: "Sardor Toshmatov", phone: "+998901110104", specialization: "MASSAGE", salaryPercent: 40 },
      { fullName: "Kamola Aliyeva", phone: "+998901110105", specialization: "PSYCHOLOGIST", salaryPercent: 50 },
    ],
  },
  {
    name: "Yunusobod filiali",
    address: "Toshkent, Yunusobod tumani, Amir Temur shoh ko'chasi 108",
    phone: "+998 71 200 20 20",
    admin: { fullName: "Zulfiya Karimova", phone: "+998902220022" },
    reception: { fullName: "Gulbahor Ernazarova", phone: "+998902220023" },
    specialists: [
      { fullName: "Madina Saidova", phone: "+998902220201", specialization: "ABA", salaryPercent: 45 },
      { fullName: "Shahzoda Umarova", phone: "+998902220202", specialization: "LOGOPED", salaryPercent: 45 },
      { fullName: "Jasur Normatov", phone: "+998902220203", specialization: "AFK", salaryPercent: 40 },
      { fullName: "Aziz Mirzayev", phone: "+998902220204", specialization: "MASSAGE", salaryPercent: 40 },
      { fullName: "Lola Ismoilova", phone: "+998902220205", specialization: "SENSORY", salaryPercent: 45 },
    ],
  },
];

const CHILD_NAMES_M = [
  "Amirbek", "Muhammadali", "Imron", "Asadbek", "Umar", "Yusuf", "Davron",
  "Islom", "Shohruh", "Temurbek", "Abdulloh", "Sanjar",
];
const CHILD_NAMES_F = [
  "Zaynab", "Omina", "Robiya", "Marjona", "Sevinch", "Nilufar",
  "Mohira", "Rayhona", "Soliha", "Zuhra", "Malika", "Sitora",
];
const SURNAMES = [
  "Abdullayev", "Tursunov", "Xolmatov", "Yo'ldoshev", "Qodirov", "Nazarov",
  "Sobirov", "Ismatullayev", "Raxmonov", "Jo'rayev", "Mahmudov", "Alimov",
];
const PARENT_FIRST_F = ["Dilfuza", "Zarina", "Nodira", "Munira", "Feruza", "Sevara", "Hulkar", "Oygul"];
const PARENT_FIRST_M = ["Rustam", "Ulug'bek", "Shavkat", "Farrux", "Bahrom", "Olim"];

const DIAGNOSES = [
  "Nutq rivojlanishining kechikishi (ONR 2-daraja)",
  "Autizm spektri buzilishi",
  "Dizartriya",
  "Alaliya",
  "Duduqlanish",
  "Sensor integratsiya buzilishi",
  "Diqqat yetishmovchiligi va gipreaktivlik",
  "Umumiy motorika rivojlanishining kechikishi",
];

/** Haftaning dushanbasi, 00:00 */
function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const shift = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - shift);
  return x;
}

const CONFIRM = "hammasini-ochirishga-roziman";

/** Ulanish manzilidagi server nomi (parolga tegmasdan) */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Bu skript bazadagi HAMMA narsani o'chiradi.
 *
 * Nega tekshiruv kerak: lokal `.env` ko'pincha bulutdagi haqiqiy bazaga ulangan
 * bo'ladi. Demo ma'lumot tiklamoqchi bo'lgan odam o'sha paytda haqiqiy markazning
 * mijozlarini, to'lovlarini va davomatini o'chirib yuborishi mumkin. Buni orqaga
 * qaytarib bo'lmaydi, shuning uchun skript o'zi to'xtaydi.
 *
 * Bo'sh bazada va lokal bazada hech narsa so'ralmaydi — ish ravon ketaveradi.
 */
async function assertSafeToWipe() {
  const [clients, sessions, payments] = await Promise.all([
    prisma.client.count(),
    prisma.session.count(),
    prisma.payment.count(),
  ]);

  // Bo'sh baza — yo'qotadigan narsa yo'q
  if (clients === 0 && sessions === 0 && payments === 0) return;

  const host = hostOf(connectionString!);
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return;

  if (process.env.SEED_CONFIRM === CONFIRM) {
    console.log(`DIQQAT: ${host} dagi ma'lumot tasdiq bilan o'chirilmoqda.`);
    return;
  }

  throw new Error(
    `To'xtatildi: "${host}" bazasida ma'lumot bor va u lokal emas.\n` +
      `  Mijozlar: ${clients}, seanslar: ${sessions}, to'lovlar: ${payments}\n\n` +
      `Bu skript ularning HAMMASINI o'chiradi va qaytarib bo'lmaydi.\n` +
      `Haqiqiy markaz bazasiga ulangan bo'lsangiz — DATABASE_URL ni tekshiring.\n\n` +
      `Haqiqatan shu bazani tozalamoqchi bo'lsangiz, avval zaxira oling:\n` +
      `  pg_dump "$DATABASE_URL" > zaxira-$(date +%F).sql\n` +
      `keyin shunday ishga tushiring:\n` +
      `  SEED_CONFIRM=${CONFIRM} npm run db:seed`,
  );
}

async function main() {
  await assertSafeToWipe();

  console.log("Eski demo ma'lumotlar tozalanmoqda...");
  await prisma.settings.deleteMany();
  await prisma.intake.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.salaryPayout.deleteMany();
  await prisma.linkCode.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.session.deleteMany();
  await prisma.package.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.client.deleteMany();
  await prisma.specialist.deleteMany();
  await prisma.user.deleteMany();
  await prisma.branch.deleteMany();

  const pwd = hashPassword(DEMO_PASSWORD);

  // Markaz egasi — barcha filiallarni ko'radi
  await prisma.user.create({
    data: {
      phone: "+998901234567",
      fullName: "Rustam Abulqosimov",
      passwordHash: pwd,
      role: "OWNER",
    },
  });

  const thisMonday = mondayOf(new Date());
  let childIdx = 0;
  let surnameIdx = 0;

  for (const b of BRANCHES) {
    const branch = await prisma.branch.create({
      data: { name: b.name, address: b.address, phone: b.phone },
    });

    await prisma.user.create({
      data: {
        phone: b.admin.phone,
        fullName: b.admin.fullName,
        passwordHash: pwd,
        role: "BRANCH_ADMIN",
        branchId: branch.id,
      },
    });

    await prisma.user.create({
      data: {
        phone: b.reception.phone,
        fullName: b.reception.fullName,
        passwordHash: pwd,
        role: "RECEPTION",
        branchId: branch.id,
      },
    });

    const specialists = [];
    for (const s of b.specialists) {
      const user = await prisma.user.create({
        data: {
          phone: s.phone,
          fullName: s.fullName,
          passwordHash: pwd,
          role: "SPECIALIST",
          branchId: branch.id,
        },
      });
      const specialist = await prisma.specialist.create({
        data: {
          userId: user.id,
          branchId: branch.id,
          specialization: s.specialization,
          salaryPercent: s.salaryPercent,
        },
      });
      specialists.push(specialist);
    }

    // Har filialda 12 mijoz
    for (let i = 0; i < 12; i++) {
      const isBoy = chance(0.6);
      const first = isBoy
        ? CHILD_NAMES_M[childIdx % CHILD_NAMES_M.length]
        : CHILD_NAMES_F[childIdx % CHILD_NAMES_F.length];
      const surname = SURNAMES[surnameIdx % SURNAMES.length];
      childIdx++;
      surnameIdx++;

      const parentIsMother = chance(0.75);
      const parentFirst = parentIsMother
        ? pick(PARENT_FIRST_F)
        : pick(PARENT_FIRST_M);
      const parentName = `${parentFirst} ${surname}a`.replace("va", "va");
      const parentPhone = `+9989${String(300000000 + childIdx * 1117).slice(0, 8)}`;

      const parentUser = await prisma.user.create({
        data: {
          phone: parentPhone,
          fullName: parentIsMother ? `${parentFirst} ${surname}a` : `${parentFirst} ${surname}`,
          passwordHash: pwd,
          role: "PARENT",
          branchId: branch.id,
        },
      });

      // Yoshi 2–9
      const ageYears = 2 + Math.floor(rnd() * 7);
      const birth = new Date();
      birth.setFullYear(birth.getFullYear() - ageYears);
      birth.setMonth(Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 27));
      birth.setHours(0, 0, 0, 0);

      const client = await prisma.client.create({
        data: {
          fullName: `${first} ${surname}`,
          birthDate: birth,
          gender: isBoy ? "M" : "F",
          branchId: branch.id,
          parentUserId: parentUser.id,
          parentName: parentUser.fullName,
          parentPhone,
          diagnosis: pick(DIAGNOSES),
          status: chance(0.9) ? "ACTIVE" : "PAUSED",
          note: chance(0.3) ? "Mashg'ulotga ota-ona bilan kiradi." : null,
        },
      });

      // 1–3 mutaxassisga biriktirish
      const howMany = 1 + Math.floor(rnd() * 3);
      const shuffled = [...specialists].sort(() => rnd() - 0.5);
      const assigned = shuffled.slice(0, howMany);

      for (const sp of assigned) {
        await prisma.assignment.create({
          data: { clientId: client.id, specialistId: sp.id },
        });

        const pricePerSession = PRICE[sp.specialization];
        // 6 seanslik paketlar ham bor — real markazda abonement tugab turadi
        const totalSessions = pick([6, 6, 8, 12, 12, 16]);
        const purchasedAt = new Date(thisMonday);
        purchasedAt.setDate(purchasedAt.getDate() - 28);
        const expiresAt = new Date(purchasedAt);
        expiresAt.setDate(expiresAt.getDate() + 60);

        const pkg = await prisma.package.create({
          data: {
            clientId: client.id,
            specialization: sp.specialization,
            totalSessions,
            pricePerSession,
            purchasedAt,
            expiresAt,
          },
        });

        // Abonement to'lovi (ba'zida bo'lib-bo'lib)
        const full = totalSessions * pricePerSession;
        if (chance(0.7)) {
          await prisma.payment.create({
            data: {
              clientId: client.id,
              branchId: branch.id,
              packageId: pkg.id,
              amount: full,
              method: pick(["CASH", "CARD", "TRANSFER"]),
              paidAt: purchasedAt,
              note: `${totalSessions} seanslik abonement`,
            },
          });
        } else {
          const firstPart = Math.round(full / 2 / 1000) * 1000;
          await prisma.payment.create({
            data: {
              clientId: client.id,
              branchId: branch.id,
              packageId: pkg.id,
              amount: firstPart,
              method: pick(["CASH", "CARD"]),
              paidAt: purchasedAt,
              note: "Abonement uchun birinchi qism",
            },
          });
          const second = new Date(purchasedAt);
          second.setDate(second.getDate() + 14);
          // Qolgan qismi hammasida ham to'lanmagan — qarzdorlar ro'yxati bo'sh qolmasin
          if (second <= new Date() && chance(0.55)) {
            await prisma.payment.create({
              data: {
                clientId: client.id,
                branchId: branch.id,
                packageId: pkg.id,
                amount: full - firstPart,
                method: pick(["CASH", "CARD", "TRANSFER"]),
                paidAt: second,
                note: "Abonement uchun qolgan qism",
              },
            });
          }
        }

        // Haftada bitta doimiy vaqt: -4 haftadan +1 haftagacha
        const weekday = Math.floor(rnd() * 6); // Dush–Shan
        const hour = 9 + Math.floor(rnd() * 9); // 09:00–17:00
        const minute = chance(0.5) ? 0 : 30;

        for (let w = -4; w <= 1; w++) {
          const starts = new Date(thisMonday);
          starts.setDate(starts.getDate() + w * 7 + weekday);
          starts.setHours(hour, minute, 0, 0);

          const isPast = starts < new Date();
          let status: string;
          if (!isPast) {
            status = "PLANNED";
          } else if (chance(0.84)) {
            status = "DONE";
          } else if (chance(0.5)) {
            status = "NO_SHOW";
          } else {
            status = chance(0.7) ? "CANCELLED_CLIENT" : "CANCELLED_CENTER";
          }

          const counts = status === "DONE" || status === "NO_SHOW";

          await prisma.session.create({
            data: {
              clientId: client.id,
              specialistId: sp.id,
              branchId: branch.id,
              packageId: pkg.id,
              startsAt: starts,
              durationMin: sp.specialization === "MASSAGE" ? 30 : 45,
              status,
              price: counts ? pricePerSession : 0,
              salaryPercent: counts ? sp.salaryPercent : null,
              note: status === "CANCELLED_CLIENT" ? "Bola kasal bo'lib qoldi" : null,
            },
          });
        }
      }
    }
  }

  // O'tgan oy uchun mutaxassislarga qisman ish haqi to'langan deb yozamiz,
  // shunda "hisoblangan / to'langan / qolgan" ko'rsatkichi tirik ko'rinadi.
  const allSpecialists = await prisma.specialist.findMany({
    include: { sessions: { select: { status: true, price: true, salaryPercent: true } } },
  });
  for (const sp of allSpecialists) {
    const accrued = sp.sessions.reduce((sum, s) => {
      if (s.status !== "DONE" && s.status !== "NO_SHOW") return sum;
      return sum + Math.round((s.price * (s.salaryPercent ?? sp.salaryPercent)) / 100);
    }, 0);
    if (accrued <= 0) continue;

    const paid = Math.round((accrued * 0.6) / 10_000) * 10_000; // ~60% to'langan
    const paidAt = new Date(thisMonday);
    paidAt.setDate(paidAt.getDate() - 7);

    await prisma.salaryPayout.create({
      data: {
        specialistId: sp.id,
        branchId: sp.branchId,
        amount: paid,
        method: pick(["CASH", "CARD"]),
        paidAt,
        note: "Oldingi davr uchun ish haqi",
      },
    });
  }

  /* ---------- Qabullar (konsultatsiyalar) ---------- */
  // Markazga birinchi marta kelgan odamlar: bir qismi mijozga aylangan,
  // bir qismi o'ylab ko'rmoqda, bittasi kelmagan — hisobot mazmunli bo'lsin.
  const intakeSpecialists = await prisma.specialist.findMany({
    select: { id: true, branchId: true },
  });
  const INTAKE_NAMES = [
    ["Sardorbek Umarov", "Nilufar Umarova"],
    ["Zilola Rashidova", "Kamola Rashidova"],
    ["Bekzod Olimov", "Shoira Olimova"],
    ["Madina Yoqubova", "Dilshod Yoqubov"],
    ["Jasurbek Komilov", "Gulbahor Komilova"],
    ["Oysha Saidova", "Ravshan Saidov"],
  ];

  for (let i = 0; i < INTAKE_NAMES.length; i++) {
    const [childName, parentName] = INTAKE_NAMES[i];
    const sp = intakeSpecialists[i % intakeSpecialists.length];
    const scheduledAt = new Date(thisMonday);
    scheduledAt.setDate(scheduledAt.getDate() - 10 + i * 2);
    scheduledAt.setHours(10 + (i % 6), i % 2 ? 30 : 0, 0, 0);

    const birthDate = new Date();
    birthDate.setFullYear(birthDate.getFullYear() - (3 + (i % 5)));
    birthDate.setMonth((i * 2) % 12);

    // Oxirgisi hali rejada, bittasi kelmagan, qolgani bo'lib o'tgan
    const status = i === INTAKE_NAMES.length - 1 ? "PLANNED" : i === 1 ? "NO_SHOW" : "DONE";
    const paid = status === "DONE";

    await prisma.intake.create({
      data: {
        branchId: sp.branchId,
        specialistId: sp.id,
        childName,
        birthDate,
        parentName,
        parentPhone: `+99893100${String(2000 + i).slice(-4)}`,
        scheduledAt,
        price: paid ? 150_000 : 0,
        paidAt: paid ? scheduledAt : null,
        method: i % 2 ? "CARD" : "CASH",
        status,
        result: status === "DONE" ? (i % 2 ? "THINKING" : "PENDING") : "PENDING",
        note: i % 3 === 0 ? "Nutq kechikishi, tanish tavsiya qilgan" : null,
      },
    });
  }

  const [branches, users, clients, sessions, payments] = await Promise.all([
    prisma.branch.count(),
    prisma.user.count(),
    prisma.client.count(),
    prisma.session.count(),
    prisma.payment.count(),
  ]);

  console.log(`
Demo ma'lumotlar tayyor:
  filial:        ${branches}
  foydalanuvchi: ${users}
  mijoz:         ${clients}
  seans:         ${sessions}
  to'lov:        ${payments}

Kirish (barcha demo parol: ${DEMO_PASSWORD})
  Markaz egasi:    +998901234567
  Filial admini:   +998901110011  (Chilonzor)
  Qabulxona:       +998901110012  (Chilonzor)
  Mutaxassis:      +998901110101  (ABA terapevt, Chilonzor)
  Ota-ona:         birinchi mijozning telefoni — mijoz kartasida ko'rinadi
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

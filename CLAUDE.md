@AGENTS.md

# Logopedik markaz CRM

Logopedik markazlar uchun boshqaruv tizimi: filiallar, mutaxassislar, mijozlar,
jadval, davomat, abonement, to'lov va ish haqi. Ishlab turgan mahsulot — haqiqiy
markaz ishlatadi, demo emas.

Batafsil tavsif `README.md` da, serverga chiqarish `DEPLOY.md` da.

## Til

**Foydalanuvchi ko'radigan hamma matn o'zbekcha** (lotin alifbosida). Kod ichidagi
izohlar ham o'zbekcha — mavjud fayllarga qarab uslubni saqlang. O'zgaruvchi va
funksiya nomlari inglizcha.

Izoh yozganda "nima qilinyapti" emas, **"nega shunday qilingan"** ni yozing: kod
nima qilishini o'zi ko'rsatib turadi.

## Texnologiyalar

Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · Tailwind v4 ·
Prisma 7 (driver adapter) · PostgreSQL (Neon) · Vercel.

Next.js 16 ko'p narsani o'zgartirgan — `AGENTS.md` aytganidek, kod yozishdan oldin
`node_modules/next/dist/docs/` dagi tegishli qo'llanmani o'qing. Masalan `next lint`
olib tashlangan, loyihada eslint yo'q.

## Buyruqlar

```bash
npm run dev           # lokal ishlab chiqish
npm run build         # yig'ish (deploy'dan oldin tekshirish uchun)
npx tsc --noEmit      # turlarni tekshirish
npm run db:push       # schema o'zgarishini bazaga yozish
npm run db:seed       # demo ma'lumot — DIQQAT, pastga qarang
```

### Xavfli buyruqlar

**`npm run db:seed` va `npm run db:reset` bazadagi HAMMA narsani o'chiradi.**
Haqiqiy mijoz ma'lumoti turgan bazada hech qachon ishlatmang. Lokal `.env` ko'pincha
o'sha bulutdagi bazaga ulangan bo'ladi — ishga tushirishdan oldin `DATABASE_URL`
qayerni ko'rsatayotganini tekshiring.

Skriptda to'siq bor: baza lokal bo'lmasa va ichida ma'lumot bo'lsa, u o'zi to'xtaydi
va nima yo'qolishini ko'rsatadi. To'siqni `SEED_CONFIRM` bilan ataylab ochish mumkin —
buni faqat zaxira olgandan keyin qiling. To'siqni kodidan olib tashlamang.

## Testlar

Brauzerdagi uchidan-uchiga tekshiruvlar, jami 84 ta. Haqiqiy `next build` ustida
ishlaydi va natijani to'g'ridan-to'g'ri bazadan tekshiradi.

```bash
npm run build && npm start -- -p 3100    # boshqa terminalda
node tests/smoke.mjs      # CRM, rollar, PWA (48)
node tests/telegram.mjs   # bog'lanish, imzo, mutaxassis Mini App (18)
node tests/parent.mjs     # ota-ona kabineti va eslatmalar (18)
```

Kod o'zgartirgandan keyin shu uchtasini ishga tushiring. Yangi imkoniyat qo'shsangiz
— unga tekshiruv ham qo'shing.

## Rollar va ko'rish doirasi

| Rol | Ko'radi |
|---|---|
| `OWNER` | hamma filial, hamma narsa |
| `BRANCH_ADMIN` | faqat o'z filiali (hozircha interfeysdan yaratilmaydi) |
| `RECEPTION` | o'z filiali: jadval, mijozlar, to'lovlar |
| `SPECIALIST` | faqat o'z mijozlari va o'z puli |
| `PARENT` | faqat o'z farzandi |

**Doira har bir so'rovda serverda qo'llanadi** (`src/lib/auth.ts` dagi `clientScope`,
`sessionScope`). Hech qachon faqat interfeysda yashirish bilan cheklanmang —
foydalanuvchi manzilni qo'lda yozishi mumkin.

## Pul mantig'i

Buni o'zgartirishdan oldin tushunib oling:

- **To'lov** mijozdan markazga keladi. Mijozga va (ixtiyoriy) abonementga bog'lanadi,
  **mutaxassisga emas**.
- **Mutaxassisning ish haqi** to'lovdan emas, **bajarilgan seansdan** hisoblanadi:
  seans narxi × foizi, seans "O'tdi/Kelmadi" deb belgilangan payt.
- **Foiz seans bilan birga saqlanadi** (`Session.salaryPercent`). Keyin mutaxassisning
  foizi o'zgarsa, o'tib bo'lgan seanslarning hisobi o'zgarmaydi. Buni buzmang.
- Abonement tugashi va qarzdorlik `src/lib/stats.ts` da hisoblanadi.

## Diqqat qilinadigan joylar

- **Amal xatolari.** Server action'lar `withFlash` bilan o'raladi (`src/lib/action.ts`).
  Usiz Next.js production'da xato matnini yashiradi va foydalanuvchi sababni
  bilmaydi. Yangi action yozsangiz, uni ham o'rang.
- **Xizmat ishchisi (sw.js) sahifalarni hech qachon keshlamaydi** — bitta telefondan
  ikki kishi kirsa, birining ma'lumoti ikkinchisiga ko'rinib qolmasligi uchun. Faqat
  o'zgarmas statik fayllar keshlanadi.
- **Mintaqa.** `vercel.json` da `fra1` — server baza bilan bir shaharda turishi shart.
  Bir sahifa bazaga 10-20 marta murojaat qiladi, ular uzoqlashsa ilova sekinlashadi.
- **Telegram imzosi** `src/lib/telegram.ts` da tekshiriladi. `initData` ni tekshirmasdan
  ishonmang.

## Ishlash tartibi

Loyiha ustida bir nechta odam ishlaydi. O'z tarmog'ingizda ishlang va Pull Request
qoldiring — to'g'ridan-to'g'ri asosiy tarmoqqa push qilmang.

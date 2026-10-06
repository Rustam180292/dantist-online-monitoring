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
npm run db:backup     # bazaning to'liq zaxirasi -> zaxira/*.json
npm run db:restore -- zaxira/<fayl>.json    # zaxiradan tiklash
npm run db:clean      # demo'ni tozalab, haqiqiy markazni ochish (savol berib boradi)
npm run db:seed       # demo ma'lumot — DIQQAT, pastga qarang
```

`db:backup` hech narsa o'rnatishni talab qilmaydi (pg_dump kerak emas). Zaxira
fayllarida shaxsiy ma'lumot bo'lgani uchun `zaxira/` papkasi git'ga tushmaydi —
uni git'ga qo'shmang.

### Xavfli buyruqlar

**`npm run db:seed` va `npm run db:reset` bazadagi HAMMA narsani o'chiradi.**
Haqiqiy mijoz ma'lumoti turgan bazada hech qachon ishlatmang. Lokal `.env` ko'pincha
o'sha bulutdagi bazaga ulangan bo'ladi — ishga tushirishdan oldin `DATABASE_URL`
qayerni ko'rsatayotganini tekshiring.

`db:restore` ham bazani almashtiradi — u ham shunday xavfli. `db:clean` esa
ataylab tozalaydi (haqiqiy ishga o'tish uchun): u o'zi zaxira oladi va tasdiq
so'zini yozdiradi.

Ikkala skriptda to'siq bor: baza lokal bo'lmasa va ichida ma'lumot bo'lsa, ular o'zi
to'xtaydi va nima yo'qolishini ko'rsatadi. To'siqni `SEED_CONFIRM` / `RESTORE_CONFIRM`
bilan ataylab ochish mumkin — buni faqat zaxira olgandan keyin qiling. To'siqni
kodidan olib tashlamang.

## Testlar

Brauzerdagi uchidan-uchiga tekshiruvlar, jami 143 ta. Haqiqiy `next build` ustida
ishlaydi va natijani to'g'ridan-to'g'ri bazadan tekshiradi.

```bash
npm run build && npm start -- -p 3100    # boshqa terminalda
node tests/smoke.mjs      # CRM, rollar, qabullar, filiallar, bo'sh vaqtlar, sozlamalar, zaxira, PWA (107)
node tests/telegram.mjs   # bog'lanish, imzo, mutaxassis Mini App (18)
node tests/parent.mjs     # ota-ona kabineti va eslatmalar (18)
```

Kod o'zgartirgandan keyin shu uchtasini ishga tushiring. Yangi imkoniyat qo'shsangiz
— unga tekshiruv ham qo'shing.

## Rollar va ko'rish doirasi

| Rol | Ko'radi |
|---|---|
| `OWNER` | hamma filial, hamma narsa; `branchId` bo'sh bo'ladi. Faqat u filial va ikkinchi ega qo'sha oladi (o'zini o'chira olmaydi) |
| `BRANCH_ADMIN` | faqat o'z filiali (hozircha interfeysdan yaratilmaydi) |
| `RECEPTION` | o'z filiali: jadval, qabullar, mijozlar, to'lovlar |
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
- **Qabul (konsultatsiya) puli** `Payment` jadvaliga tushmaydi (qabul hali mijoz
  emas) — summa `Intake.price` da turadi. Lekin u ham kassaga tushgan pul, shuning
  uchun `getOverview().collected` ga qo'shiladi va To'lovlar sahifasida alohida
  ro'yxat bo'lib ko'rinadi. Hisobotda "Konsultatsiyalardan" deb ajratib ham
  ko'rsatiladi. Bu uch joydagi raqam bir xil bo'lishi kerak.

Yangi jadval qo'shsangiz, uni `prisma/tables.ts` ga ham qo'shing — aks holda
`db:backup` uni zaxiraga olmaydi va `db:seed` tozalashda chet el kaliti xatosi
beradi.

## Diqqat qilinadigan joylar

- **Amal xatolari.** Server action'lar `withFlash` bilan o'raladi (`src/lib/action.ts`).
  Usiz Next.js production'da xato matnini yashiradi va foydalanuvchi sababni
  bilmaydi. Yangi action yozsangiz, uni ham o'rang.
- **Bajarilgani ham ko'rinsin.** Natijasi ekranda darhol bilinmaydigan amal
  (tahrirlash, to'lov) `setFlash(xabar, "ok")` bilan yashil xabar qoldirsin.
  Aks holda foydalanuvchi "ishlamadi" deb o'ylaydi — ayniqsa yozuv ro'yxatdan
  chiqib ketsa (masalan sana boshqa oyga ko'chsa).
- **Xizmat ishchisi (sw.js) sahifalarni hech qachon keshlamaydi** — bitta telefondan
  ikki kishi kirsa, birining ma'lumoti ikkinchisiga ko'rinib qolmasligi uchun. Faqat
  o'zgarmas statik fayllar keshlanadi.
- **Mintaqa.** `vercel.json` da `fra1` — server baza bilan bir shaharda turishi shart.
  Bir sahifa bazaga 10-20 marta murojaat qiladi, ular uzoqlashsa ilova sekinlashadi.
- **Telegram imzosi** `src/lib/telegram.ts` da tekshiriladi. `initData` ni tekshirmasdan
  ishonmang.
- **Markaz sozlamalari** `src/lib/settings.ts` dagi `getSettings()` orqali olinadi.
  Bazada bitta qator (`id = "main"`); hali yozilmagan bo'lsa standart qiymatlar
  qaytadi — sahifa sozlama yo'qligi sababli ishlamay qolmasin. Ish vaqti
  shu yerdan olinadi va "Bo'sh vaqtlar" (`/slots`) o'shanga tayanadi.

## Ishlash tartibi

Loyiha ustida bir nechta odam ishlaydi. O'z tarmog'ingizda ishlang va Pull Request
qoldiring — to'g'ridan-to'g'ri asosiy tarmoqqa push qilmang.

Sahifadagi matnni tekshirganda `page.content()` emas, `innerText` ishlating:
`content()` HTML qaytaradi va pul formatidagi uzilmas probel u yerda `&nbsp;`
bo'lib qoladi — "100 000 so'm" hech qachon topilmaydi.

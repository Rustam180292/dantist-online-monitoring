# Logopedik markaz CRM

Logopedik / rivojlanish markazi uchun boshqaruv tizimi. Mohiyati sodda:

```
Filial  →  Mutaxassis  →  Mijoz (bola)  →  Mashg'ulot (seans)  →  To'lov
```

Demo ma'lumotlarda **2 filial**, har birida **5 mutaxassis** (ABA terapevt,
logoped-defektolog, AFK, massajchi, psixolog / sensor integratsiya) va har
mutaxassisning **o'z mijozlari** bor.

## Nimalarni qiladi

| Bo'lim | Imkoniyat |
|---|---|
| **Panel** | Oylik ko'rsatkichlar: faol mijozlar, o'tgan seanslar, davomat %, kassa, xizmat qiymati, mutaxassis haqi, markaz ulushi, qarzdorlik. Bugungi jadval. Abonementi tugayotganlar ro'yxati. |
| **Jadval** | Haftalik jadval, oldinga/orqaga o'tish, filial va mutaxassis bo'yicha filtr. Bir bosishda davomat: **O'tdi / Kelmadi / Bekor**. Yangi seans qo'shish (mutaxassisning band vaqti tekshiriladi). |
| **Mijozlar** | Qidiruv va filtr, qolgan seans va qarz ustunlari. Mijoz kartasi: abonementlar (progress bilan), seanslar tarixi, to'lovlar, biriktirilgan mutaxassislar, holat (Faol / To'xtatilgan / Arxiv). |
| **Mutaxassislar** | Oylik natijalar: mijoz soni, o'tdi/kelmadi/rejada, xizmat qiymati, ish haqi foizi va hisoblangan ish haqi. Yangi mutaxassis (login bilan) qo'shish, foizni o'zgartirish, ishdan bo'shatish/qaytarish. |
| **To'lovlar** | Oy bo'yicha tushum, usul kesimi (naqd/karta/o'tkazma), to'lovlar ro'yxati va qarzdorlar. |
| **Hisobotlar** | Oylik hisobot: filiallar kesimi, mutaxassislar kesimi, yo'nalishlar kesimi, markaz ulushi. |
| **Ota-ona kabineti** | Ota-ona faqat o'z farzandini ko'radi: keyingi mashg'ulotlar, qolgan seans, abonement holati, davomat tarixi, qarzdorlik. |

## Rollar va ko'rish doirasi

| Rol | Nimani ko'radi |
|---|---|
| `OWNER` — markaz egasi | Barcha filiallar, barcha bo'limlar |
| `BRANCH_ADMIN` — filial admini | Faqat o'z filiali |
| `SPECIALIST` — mutaxassis | Faqat o'ziga biriktirilgan mijozlar va o'z seanslari; davomat belgilaydi. To'lov/hisobot bo'limlari yopiq |
| `PARENT` — ota-ona | Faqat o'z farzandi, o'zgartirish huquqisiz |

Doira server tomonida — `src/lib/auth.ts` dagi `clientScope()` va `sessionScope()`
har bir so'rovga qo'shiladi, ya'ni URL'ni qo'lda yozish bilan chetlab o'tib
bo'lmaydi.

## Ishga tushirish

```bash
npm install
cp .env.example .env        # kerak bo'lsa DATABASE_URL va SESSION_SECRET ni o'zgartiring
npm run db:reset            # bazani yaratadi va demo ma'lumot to'ldiradi
npm run dev                 # http://localhost:3000
```

Production uchun:

```bash
npm run build && npm start
```

### Demo kirish (parol: `parol123`)

| Rol | Telefon (login) |
|---|---|
| Markaz egasi | `+998901234567` |
| Filial admini (Chilonzor) | `+998901110011` |
| Filial admini (Yunusobod) | `+998902220022` |
| Mutaxassis (ABA, Chilonzor) | `+998901110101` |
| Ota-ona | mijoz kartasida ko'rinadi |

> Demo parollar faqat sinov uchun. Haqiqiy ishlatishda `prisma/seed.ts` dagi
> `DEMO_PASSWORD` ni ishlatmang va `.env` dagi `SESSION_SECRET` ni
> `openssl rand -hex 32` bilan almashtiring.

## Texnologiyalar

- **Next.js 16** (App Router, Server Actions) + **React 19** + **TypeScript**
- **Prisma 7** + **SQLite** (`better-sqlite3` driver adapteri orqali)
- **Tailwind CSS v4**
- Auth: `scrypt` bilan parol xeshi + HMAC-SHA256 bilan imzolangan httpOnly cookie
  (tashqi kutubxonasiz, `src/lib/auth.ts`)

Barcha sahifalar server komponentlari, o'zgartirishlar Server Action orqali —
ya'ni mijoz tomonida ortiqcha JS yo'q, telefon brauzerida ham tez ishlaydi.

## Loyiha tuzilishi

```
prisma/
  schema.prisma        ma'lumot modeli (Branch, User, Specialist, Client,
                       Assignment, Package, Session, Payment)
  seed.ts              demo ma'lumotlar
src/
  app/
    login/             kirish sahifasi va auth action'lari
    (app)/             tizim ichi: panel, jadval, mijozlar, mutaxassislar,
                       to'lovlar, hisobotlar, ota-ona kabineti
  lib/
    auth.ts            sessiya, parol, rol bo'yicha ko'rish doirasi
    prisma.ts          baza ulanishi
    stats.ts           davomat, daromad, ish haqi, abonement hisob-kitobi
    constants.ts       rollar, mutaxassisliklar, holatlar (o'zbekcha nomlar)
    format.ts          sana, vaqt, pul va yosh formatlash
  components/          umumiy UI (kartalar, jadval, menyu, ikonkalar)
tests/
  smoke.mjs            brauzerdagi uchidan-uchiga tekshiruv
```

## Hisob-kitob mantig'i

- Seans **"O'tdi"** yoki **"Kelmadi (sababsiz)"** bo'lsa — abonementdan yechiladi
  va xizmat qiymatiga qo'shiladi (`BILLABLE_STATUSES`). Bekor qilingani
  yechilmaydi.
- **Mutaxassis haqi** = o'tgan seanslar qiymati × mutaxassisning foizi.
- **Markaz ulushi** = xizmat qiymati − mutaxassis haqi.
- **Qarzdorlik** = abonement to'liq qiymati − shu abonementga tushgan to'lovlar.
- **Kassaga tushgan** — davr ichidagi to'lovlar (xizmat qiymatidan farq qiladi:
  abonement oldindan to'lanadi, seans keyin o'tadi).

## Tekshiruv

Tiplar va build:

```bash
npx tsc --noEmit
npm run build
```

Brauzerdagi uchidan-uchiga tekshiruv (kirish, davomat, seans qo'shish, to'lov,
rollar chegarasi — 18 ta tekshiruv):

```bash
npm i -D playwright && npx playwright install chromium   # bir martalik
npm run db:reset
npm run build && npm start -- -p 3100                    # boshqa terminalda
node tests/smoke.mjs
```

> `npm run db:reset` baza faylini o'chirib qaytadan yaratadi. Ishlab turgan
> server eski faylga ulangan holda qoladi, shuning uchun reset'dan keyin
> serverni qayta ishga tushiring.

## Postgres'ga o'tish

SQLite bitta fayl — bir filialning kundalik ishiga yetadi, lekin bir nechta
odam bir vaqtda yozsa Postgres afzal:

1. `prisma/schema.prisma` da `provider = "postgresql"`;
2. `npm i @prisma/adapter-pg pg` va `src/lib/prisma.ts` da adapterni almashtirish;
3. `.env` da `DATABASE_URL="postgresql://..."`;
4. `npx prisma migrate dev`.

Qolgan kod o'zgarishsiz qoladi.

## Keyingi bosqichlar uchun g'oyalar

- SMS / Telegram orqali ota-onaga mashg'ulot eslatmasi va qarz haqida xabar
- Mutaxassisning mashg'ulot kundaligi (har bir seansdan keyin qisqa hisobot)
- Bolaning rivojlanish dinamikasi: maqsadlar va natijalar grafigi
- Ish haqi vedomosti (oylik, chop etish uchun)
- Xona (kabinet) bandligi va jadvalda ziddiyatni tekshirish
- Hisobotlarni Excel'ga yuklash

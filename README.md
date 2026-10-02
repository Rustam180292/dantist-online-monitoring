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
| **Mutaxassislar** | Oylik natijalar: mijoz soni, o'tdi/kelmadi/rejada, xizmat qiymati, ish haqi foizi va hisoblangan ish haqi. Yangi mutaxassis (login bilan) qo'shish, foizni o'zgartirish, ishdan bo'shatish/qaytarish. **Ish haqi hisob-kitobi**: hisoblangan − to'langan = qolgan, bir bosishda to'lab berish. |
| **Pulim** (mutaxassis) | Mutaxassisning o'z kabineti: qolgan (olishim kerak), shu oyda hisoblangan, jami hisoblangan va to'langan; har bir seansdan qancha tekkani va qo'lga tekkan to'lovlar tarixi. |
| **To'lovlar** | Oy bo'yicha tushum, usul kesimi (naqd/karta/o'tkazma), to'lovlar ro'yxati va qarzdorlar. |
| **Hisobotlar** | Oylik hisobot: filiallar kesimi, mutaxassislar kesimi, yo'nalishlar kesimi, markaz ulushi. |
| **Ota-ona kabineti** | Ota-ona faqat o'z farzandini ko'radi: keyingi mashg'ulotlar, qolgan seans, abonement holati, davomat tarixi, qarzdorlik. Telegram Mini App ko'rinishi ham bor (bir nechta farzand bo'lsa — almashtirib ko'radi). |
| **Avtomatik eslatmalar** | Ota-onaga Telegram orqali: ertangi mashg'ulot, mashg'ulot o'tgani, abonement tugayotgani, to'lanmagan qarz. Bir xil xabar ikki marta ketmaydi. |

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

## Telegram Mini App

Mutaxassis (va keyinchalik ota-ona) kabinetini Telegram ichida ochadi — alohida
ilova o'rnatish shart emas, do'konga chiqarish kerak emas, yangilanish darhol
hammaga yetib boradi.

### Qanday ishlaydi

```
Botga /start  →  "Raqamimni yuborish"  →  raqam CRM bazasidan topiladi
              →  Telegram akkaunti foydalanuvchiga bog'lanadi
              →  "Kabinetni ochish" tugmasi  →  Mini App ochiladi
```

Mini App ochilganda Telegram `initData` yuboradi; server uni bot tokeni bilan
HMAC-SHA256 orqali tekshiradi (`src/lib/telegram.ts`) va faqat imzo to'g'ri
bo'lsagina sessiya ochadi. Ya'ni kabinetga Telegram orqali tasdiqlangan odam
kiradi, parol kiritish shart emas.

**Mutaxassis** Mini App'da ko'radigan bo'limlar: **Bugun** (davomat belgilash),
**Hafta**, **Mijozlarim** (qolgan seans, keyingi mashg'ulot, ota-ona telefoni),
**Pulim** (qolgan / hisoblangan / to'langan).

**Ota-ona** ko'radigan bo'limlar: keyingi mashg'ulot (eng yuqorida), qolgan seans
va qarzdorlik, **Jadval** (rejadagi mashg'ulotlar), **Davomat** (tarix),
**Abonement** (har bir yo'nalish bo'yicha holat va to'lov). Bir nechta farzandi
bo'lsa, yuqoridan almashtirib ko'radi. Pastda filial manzili va telefoni —
bosib qo'ng'iroq qilsa bo'ladi.

### Avtomatik eslatmalar

Ota-onaga to'rt xil xabar boradi:

| Xabar | Qachon |
|---|---|
| 🔔 Ertangi mashg'ulot | Cron har kuni ishga tushganda, ertangi rejadagi seanslar uchun |
| ✅ Mashg'ulot o'tdi | Mutaxassis "O'tdi" deb belgilagan zahoti (abonementda qolgan seans bilan) |
| ⏳ Abonement tugayapti | 2 va kamroq seans qolganda (2 → 1 → 0 da qayta eslatadi) |
| 💳 To'lov eslatmasi | Qarz bo'lsa, haftada bir marta |

Har bir xabarning o'z `dedupeKey` si bor — **bir xil xabar ikki marta
yuborilmaydi**. Yuborilmagan xabar (masalan, internet uzilgan bo'lsa) navbatda
qoladi va keyingi yurishda 3 martagacha qayta sinaladi. Adminlar har bir xabarni
mijoz kartasida ko'rib turadi.

Cron'ni ulash (kuniga bir marta, masalan kechki 19:00):

```bash
curl -X POST -H "x-cron-secret: $CRON_SECRET" https://sizning-domeningiz.uz/api/tg/notify
```

`crontab` misoli:

```
0 19 * * *  curl -s -X POST -H "x-cron-secret: SIR" https://sizning-domeningiz.uz/api/tg/notify
```

### Sozlash

1. [@BotFather](https://t.me/BotFather) da bot ochib, token oling.
2. `.env` ni to'ldiring:

```bash
TELEGRAM_BOT_TOKEN="123456:AA..."
TELEGRAM_WEBHOOK_SECRET="uzun-tasodifiy-satr"   # openssl rand -hex 16
APP_URL="https://sizning-domeningiz.uz"          # HTTPS shart
CRON_SECRET="yana-bir-tasodifiy-satr"            # eslatmalar cron'i uchun
```

3. Webhook'ni ulang:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<APP_URL>/api/tg/webhook&secret_token=<SECRET>"
```

4. BotFather'da **Menu Button** sifatida `<APP_URL>/tg` ni qo'ying.

> Mini App faqat **HTTPS** domenda ochiladi — lokal `http://localhost` da
> Telegram uni ochmaydi. Shuning uchun lokalda tekshirish `tests/telegram.mjs`
> orqali qilinadi: u haqiqiy imzoni o'zi yasab, server kodidagi tekshiruvni
> aynan ishlab chiqarishdagidek sinaydi.

### Xavfsizlik

- Webhook `x-telegram-bot-api-secret-token` sarlavhasini tekshiradi — begona
  so'rov 403 oladi.
- Boshqa odamning kontaktini yuborib qo'yish ishlamaydi: `contact.user_id`
  xabar egasining `from.id` si bilan mos kelishi shart.
- `initData` 24 soatdan eski bo'lsa qabul qilinmaydi.
- Bazada yo'q raqam bog'lanmaydi — avval admin uni tizimga kiritishi kerak.

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
                       to'lovlar, hisobotlar, pulim, ota-ona kabineti
    tg/                Telegram Mini App (mutaxassis va ota-ona kabineti)
    api/tg/            bot webhook'i, Mini App imzo tekshiruvi, eslatmalar cron'i
  lib/
    auth.ts            sessiya, parol, rol bo'yicha ko'rish doirasi
    prisma.ts          baza ulanishi
    stats.ts           davomat, daromad, ish haqi, abonement hisob-kitobi
    constants.ts       rollar, mutaxassisliklar, holatlar (o'zbekcha nomlar)
    telegram.ts        initData imzosini tekshirish, bot xabarlari
    notify.ts          eslatmalarni navbatga qo'yish va yuborish
    format.ts          sana, vaqt, pul va yosh formatlash
  components/          umumiy UI (kartalar, jadval, menyu, ikonkalar)
tests/
  smoke.mjs            CRM: kirish, davomat, to'lov, ish haqi, rollar (22 ta)
  telegram.mjs         bog'lanish, imzo, mutaxassis Mini App'i (18 ta)
  parent.mjs           ota-ona kabineti va eslatmalar (18 ta)
```

## Hisob-kitob mantig'i

- Seans **"O'tdi"** yoki **"Kelmadi (sababsiz)"** bo'lsa — abonementdan yechiladi
  va xizmat qiymatiga qo'shiladi (`BILLABLE_STATUSES`). Bekor qilingani
  yechilmaydi.
- **Mutaxassis haqi** = har bir o'tgan seans qiymati × o'sha seansdagi foiz.
  Foiz seans "o'tdi/kelmadi" deb belgilangan paytda seansga yozib qo'yiladi
  (`Session.salaryPercent`), shuning uchun keyin foizni o'zgartirsangiz
  **o'tib bo'lgan oylarning hisobi o'zgarmaydi**.
- **Mutaxassisning qolgan puli** = unga boshidan beri hisoblangan − unga
  to'lab berilgan (`SalaryPayout`).
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

Brauzerdagi uchidan-uchiga tekshiruvlar — jami 58 ta:

```bash
npm i -D playwright && npx playwright install chromium   # bir martalik
npm run db:reset
npm run build && npm start -- -p 3100                    # boshqa terminalda
node tests/smoke.mjs      # CRM: kirish, davomat, to'lov, ish haqi, rollar (22)
node tests/telegram.mjs   # Telegram: bog'lanish, imzo, Mini App (18)
node tests/parent.mjs     # Ota-ona kabineti va eslatmalar (18)
```

`tests/telegram.mjs` va `tests/parent.mjs` ishlashi uchun `.env` da
`TELEGRAM_BOT_TOKEN` va `CRON_SECRET` bo'lishi kerak — lokal sinov uchun istalgan
satr yetadi, ular faqat imzo yasash va tekshirish uchun ishlatiladi.

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

- Mutaxassisning mashg'ulot kundaligi (har bir seansdan keyin qisqa hisobot)
- Ota-ona Mini App'dan mashg'ulotni bekor qilish / ko'chirish so'rovi
- Bolaning rivojlanish dinamikasi: maqsadlar va natijalar grafigi
- Ish haqi vedomosti (oylik, chop etish uchun)
- Xona (kabinet) bandligi va jadvalda ziddiyatni tekshirish
- Hisobotlarni Excel'ga yuklash

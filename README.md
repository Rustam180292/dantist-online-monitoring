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
| **Panel** | Oylik ko'rsatkichlar: faol mijozlar, o'tgan seanslar, davomat %, kassa, xizmat qiymati, mutaxassis haqi, markaz ulushi. Bugungi jadval. |
| **Jadval** | Haftalik jadval, oldinga/orqaga o'tish, filial va mutaxassis bo'yicha filtr. Bir bosishda davomat: **O'tdi / Kelmadi / Bekor**. Yangi seans qo'shish (mutaxassisning band vaqti tekshiriladi). |
| **Mijozlar** | Qidiruv va filtr; har bir mijozning to'lagani, ko'rsatilgan xizmatlar summasi va qoldig'i; holatni ro'yxatdan almashtirish. Mijoz kartasi: xizmatlar, seanslar tarixi, to'lovlar, biriktirilgan mutaxassislar, holat (Faol / To'xtatilgan / Arxiv). |
| **Xodimlar** | Oylik natijalar: mijoz soni, o'tdi/kelmadi/rejada, xizmat qiymati, ish haqi foizi va hisoblangan ish haqi. Yangi mutaxassis (login bilan) qo'shish, foizni o'zgartirish, ishdan bo'shatish/qaytarish. **Ish haqi hisob-kitobi**: hisoblangan − to'langan = qolgan, bir bosishda to'lab berish. |
| **Pulim** (mutaxassis) | Mutaxassisning o'z kabineti: qolgan (olishim kerak), shu oyda hisoblangan, jami hisoblangan va to'langan; har bir seansdan qancha tekkani va qo'lga tekkan to'lovlar tarixi. |
| **To'lovlar** | Oy bo'yicha tushum, usul kesimi (naqd/karta/o'tkazma), to'lovlar ro'yxati, konsultatsiyalar. |
| **Hisobotlar** | Oylik hisobot: filiallar kesimi, mutaxassislar kesimi, yo'nalishlar kesimi, markaz ulushi. |
| **Ota-ona kabineti** | Ota-ona faqat o'z farzandini ko'radi: keyingi mashg'ulotlar, davomat tarixi, to'lovlar, mutaxassislar. Telegram Mini App ko'rinishi ham bor (bir nechta farzand bo'lsa — almashtirib ko'radi). |
| **Avtomatik eslatmalar** | Ota-onaga Telegram orqali: ertangi mashg'ulot va mashg'ulot o'tgani. Bir xil xabar ikki marta ketmaydi. |
| **Ko'rinish va til** | Tun va kun rejimi (kunduzgisi oq, mentol va havo rang tusida). Interfeys tili: o'zbekcha, inglizcha, ruscha — menyu pastida, Sozlamalarda va kirish sahifasida tanlanadi; tanlov shu qurilmada saqlanadi. Markaz egasi Sozlamalardan logotip yuklaydi — u menyuda va kirish sahifasida ko'rinadi. |

## Rollar va ko'rish doirasi

| Rol | Nimani ko'radi |
|---|---|
| `OWNER` — markaz egasi | Barcha filiallar, barcha bo'limlar. Markazni ikki kishi birga yuritsa, **Xodimlar** bo'limidan ikkinchi egalik akkaunti ochiladi |
| `BRANCH_ADMIN` — filial admini | Faqat o'z filiali, barcha bo'limlar |
| `RECEPTION` — qabulxona xodimi | O'z filialida **Jadval, Qabullar, Mijozlar, To'lovlar**. Mijoz qabul qiladi, to'lov oladi, davomat belgilaydi. Maosh, xodimlar va hisobotlar ko'rinmaydi; yozilgan to'lovni o'chira olmaydi |
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
**Hafta**, **Mijozlarim** (keyingi mashg'ulot, ota-ona telefoni),
**Pulim** (qolgan / hisoblangan / to'langan).

**Ota-ona** ko'radigan bo'limlar: keyingi mashg'ulot (eng yuqorida),
**Farzandim** (o'tgan va rejadagi mashg'ulotlar soni), **Jadval** (rejadagi
mashg'ulotlar), **Davomat** (tarix), **To'lovlar**, **Mutaxassislar**. Bir nechta farzandi
bo'lsa, yuqoridan almashtirib ko'radi. Pastda filial manzili va telefoni —
bosib qo'ng'iroq qilsa bo'ladi.

### Avtomatik eslatmalar

Ota-onaga ikki xil xabar boradi (markazda abonement yo'q — abonement tugashi
va qarz eslatmalari yuborilmaydi):

| Xabar | Qachon |
|---|---|
| 🔔 Ertangi mashg'ulot | Cron har kuni ishga tushganda, ertangi rejadagi seanslar uchun |
| ✅ Mashg'ulot o'tdi | Mutaxassis "O'tdi" deb belgilagan zahoti |

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
CRON_SECRET="yana-bir-tasodifiy-satr"            # eslatma va zaxira cron'i uchun
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

## Telefonga o'rnatish (PWA)

Tizim telefon bosh ekraniga **ilova sifatida o'rnatiladi** — do'kondan yuklab
olish, APK tarqatish yoki hech narsa imzolash shart emas. O'rnatilgach alohida
ikonka paydo bo'ladi va brauzer satrisiz, to'liq ekranda ochiladi.

**Ilova kim kirganiga qarab o'zi to'g'ri ekranni ochadi:**

| Kim | Nima ochiladi |
|---|---|
| Mutaxassis | Telefon kabineti (`/m`): Bugun, Hafta, Mijozlarim, Pulim |
| Ota-ona | Telefon kabineti (`/m`): keyingi mashg'ulot, jadval, davomat, to'lovlar |
| Markaz egasi / filial admini | To'liq boshqaruv paneli (katta jadvallar va hisobotlar) |

Mutaxassis va ota-ona kabineti — Telegram Mini App bilan **aynan bir xil
ekran**. Ya'ni xodim xohlasa Telegram'dan, xohlasa telefonga o'rnatilgan
ilovadan kiradi, ko'rinish bir xil. Kabinet pastida «To'liq ko'rinish»
havolasi bor — katta jadval kerak bo'lsa o'sha yerga o'tadi.

- **Android (Chrome):** `/install` sahifasidagi «Ilovani o'rnatish» tugmasi,
  yoki menyudan «Ilovani o'rnatish»
- **iPhone / iPad (Safari):** «Ulashish» → «Bosh ekranga qo'shish»
- **Kompyuter (Chrome / Edge):** manzil satridagi o'rnatish belgisi

Xodimlarga shunchaki `<domen>/install` havolasini yuborsangiz yetadi — sahifa
telefon turini o'zi aniqlab, mos yo'riqnomani ko'rsatadi. Tizim ichida ham
taklif chiqadi: telefon kabinetining (`/m`) pastida va telefon o'lchamidagi
ekranda panel sahifalarining ustida — Android'da bitta bosishda o'rnatadi,
boshqa yerda `/install` yo'riqnomasiga olib boradi. Kompyuterda u yon
menyuning pastida turadi. Ilova o'rnatilgan bo'lsa yoki sahifa Telegram
ichida ochilgan bo'lsa, taklif umuman ko'rsatilmaydi.

> **Nega APK emas?** APK Google Play'siz tarqatilganda har bir telefonda
> «noma'lum manbalardan o'rnatish» ni yoqish kerak, Play Protect ogohlantiradi
> va eng muhimi — iPhone'da umuman ishlamaydi. PWA ikkala tizimda ham bir xil
> ishlaydi. Keyinchalik haqiqatan APK kerak bo'lsa, shu PWA'dan PWABuilder yoki
> Bubblewrap orqali yasash mumkin — ya'ni bu yo'l APK eshigini yopmaydi.

**Ishlab chiqish rejimida xizmat ishchisi o'chirilgan.** `npm run dev` da u
ro'yxatdan o'tmaydi va avval o'rnatilgan bo'lsa olib tashlanadi — aks holda
eski fayllar keshda qolib, o'zgarishlar ko'rinmay qoladi. Telefonga o'rnatishni
sinash uchun `npm run build && npm start` ishlating.

**Offline holat:** sahifalar hech qachon keshlanmaydi — ularda shaxsiy ma'lumot
bor va bitta telefondan ikki kishi kirsa birining ma'lumoti ikkinchisiga
ko'rinib qolishi mumkin edi. Faqat o'zgarmaydigan fayllar (ikonka, shriftlar,
skriptlar) saqlanadi, internet uzilsa esa "aloqa yo'q" sahifasi chiqadi.

## Ishga tushirish

```bash
npm install
cp .env.example .env        # DATABASE_URL va SESSION_SECRET ni to'ldiring
npm run db:reset            # jadvallarni yaratadi va demo ma'lumot to'ldiradi
npm run dev                 # http://localhost:3000
```

**Baza kerak.** Eng tez yo'l — [neon.tech](https://neon.tech) da bepul
PostgreSQL ochib, ulanish manzilini `.env` dagi `DATABASE_URL` ga qo'yish.
Lokalda o'rnatilgan PostgreSQL ham bo'ladi.

Internetga chiqarish uchun: **[DEPLOY.md](DEPLOY.md)** — bosqichma-bosqich
yo'riqnoma (bepul manzil, Telegram bot va eslatmalar bilan).

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
| Qabulxona xodimi (Chilonzor) | `+998901110012` |
| Mutaxassis (ABA, Chilonzor) | `+998901110101` |
| Ota-ona | mijoz kartasida ko'rinadi |

> Demo parollar faqat sinov uchun. Haqiqiy ishlatishda `prisma/seed.ts` dagi
> `DEMO_PASSWORD` ni ishlatmang va `.env` dagi `SESSION_SECRET` ni
> `openssl rand -hex 32` bilan almashtiring.

Bu ro'yxat kirish sahifasida ham ko'rinadi — lekin **faqat lokalda**. Ishlab
turgan saytda u yashiringan: sayt internetda ochiq, ro'yxat ko'rinsa istalgan
odam markaz egasi sifatida kirib ketardi. Sinov uchun ataylab ko'rsatmoqchi
bo'lsangiz, serverda `DEMO_LOGINS=1` qo'ying — haqiqiy markaz ishga tushganda
uni olib tashlang.

## Texnologiyalar

- **Next.js 16** (App Router, Server Actions) + **React 19** + **TypeScript**
- **Prisma 7** + **PostgreSQL** (`pg` driver adapteri orqali)
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
    m/                 telefon kabineti (mutaxassis va ota-ona) — ilova ham,
                       Telegram Mini App ham shu sahifani ochadi
    tg/                Telegram kirish nuqtasi (imzoni tekshirib /m ga o'tkazadi)
    api/tg/            bot webhook'i, Mini App imzo tekshiruvi, eslatmalar cron'i
    api/backup/        zaxirani Telegram orqali egaga yuboradigan cron manzili
  lib/
    auth.ts            sessiya, parol, rol bo'yicha ko'rish doirasi
    prisma.ts          baza ulanishi
    stats.ts           davomat, daromad, ish haqi
    constants.ts       rollar, mutaxassisliklar, holatlar (o'zbekcha nomlar)
    action.ts          amal xatolarini foydalanuvchiga xabar qilib yetkazish
    flash.ts           qisqa xabar cookie'si
    telegram.ts        initData imzosini tekshirish, bot xabarlari
    notify.ts          eslatmalarni navbatga qo'yish va yuborish
    format.ts          sana, vaqt, pul va yosh formatlash
  components/          umumiy UI (kartalar, jadval, menyu, ikonkalar)
public/                ikonkalar, xizmat ishchisi (sw.js), offline sahifa
tests/
  db.mjs               testlar uchun bazaga kichik ulanish
  smoke.mjs            CRM: kirish, davomat, to'lov, ish haqi, rollar, qabullar, filiallar, bo'sh vaqtlar, sozlamalar, zaxira, Telegram holati, kunlik to'lov, mijozni o'chirish, to'lovni tuzatish, panel jadvallari, vaqt zonasi, yakka mutaxassis, PWA, kanalga e'lon, Telegram'da login yopiq, xizmatlar, abonementsiz hisob, egani tahrirlash, mijoz formasi, yakka sozlamalari, qo'shish oynasi yopilishi, ish vaqti va tushlik, Google Sheets zaxira, mijozlar puli va holati (230 ta)
  telegram.mjs         bog'lanish, imzo, mutaxassis Mini App'i (19 ta)
  parent.mjs           ota-ona kabineti, eslatmalar, to'lovlar, mutaxassislar, bekor qilish, Farzandim, tun/kun, Telegram'dan tashqari kirish yo'q (30 ta)
```

## Hisob-kitob mantig'i

- Markazda abonement yo'q: har seans alohida, xizmat narxida hisoblanadi.
- Seans **"O'tdi"** yoki **"Kelmadi (sababsiz)"** bo'lsa — xizmat qiymatiga
  qo'shiladi (`BILLABLE_STATUSES`). Bekor qilingani
  yechilmaydi.
- **Mutaxassis haqi** = har bir o'tgan seans qiymati × o'sha seansdagi foiz.
  Foiz seans "o'tdi/kelmadi" deb belgilangan paytda seansga yozib qo'yiladi
  (`Session.salaryPercent`), shuning uchun keyin foizni o'zgartirsangiz
  **o'tib bo'lgan oylarning hisobi o'zgarmaydi**.
- **Mutaxassisning qolgan puli** = unga boshidan beri hisoblangan − unga
  to'lab berilgan (`SalaryPayout`).
- **Markaz ulushi** = xizmat qiymati − mutaxassis haqi.
- **Kassaga tushgan** — davr ichidagi to'lovlar va konsultatsiyalar (xizmat
  qiymatidan farq qilishi mumkin: to'lov seans kunidan oldin yoki keyin
  yozilishi mumkin).

## Tekshiruv

Tiplar va build:

```bash
npx tsc --noEmit
npm run build
```

Brauzerdagi uchidan-uchiga tekshiruvlar — jami 320 ta:

```bash
npm i -D playwright && npx playwright install chromium   # bir martalik
npm run db:reset
npm run build && npm start -- -p 3100                    # boshqa terminalda
node tests/smoke.mjs      # CRM: kirish, davomat, to'lov, ish haqi, rollar, qabullar, filiallar, bo'sh vaqtlar, sozlamalar, zaxira, Telegram holati, kunlik to'lov, mijozni o'chirish, to'lovni tuzatish, panel jadvallari, vaqt zonasi, yakka mutaxassis, PWA, kanalga e'lon, Telegram'da login yopiq, xizmatlar, abonementsiz hisob, egani tahrirlash, mijoz formasi, yakka sozlamalari, qo'shish oynasi yopilishi, ish vaqti va tushlik, Google Sheets zaxira, mijozlar puli va holati (230)
node tests/telegram.mjs   # Telegram: bog'lanish, imzo, Mini App (19)
node tests/parent.mjs     # Ota-ona kabineti, eslatmalar, to'lovlar, mutaxassislar, bekor qilish, Farzandim, tun/kun, Telegram'dan tashqari kirish yo'q (30)
node tests/prefs.mjs      # Tun/kun rejimi, til (uz/en/ru), tarjima to'liqligi, logotip, tepa panel (41)
```

Testlar bazaga to'g'ridan-to'g'ri ham qaraydi (`tests/db.mjs`), shuning uchun
`.env` da `DATABASE_URL` bo'lishi shart. `tests/telegram.mjs` va
`tests/parent.mjs` uchun qo'shimcha `TELEGRAM_BOT_TOKEN` va `CRON_SECRET`
kerak — lokal sinov uchun istalgan satr yetadi, ular faqat imzo yasash va
tekshirish uchun ishlatiladi.

> `npm run db:reset` bazadagi hamma ma'lumotni o'chirib, demo ma'lumotni
> qayta yozadi. Haqiqiy mijozlar kiritilgandan keyin uni ishlatmang.

## Baza haqida

Ma'lumotlar **PostgreSQL** da saqlanadi. Prisma `pg` driver-adapteri orqali
ulanadi, ya'ni istalgan PostgreSQL to'g'ri keladi: Neon, Supabase, o'z
serveringizdagi baza yoki mahalliy hosting. Ko'chish uchun faqat
`DATABASE_URL` ni almashtirish va `npx prisma db push` ishlatish kifoya —
kod o'zgarmaydi.

### Zaxira nusxa

Uch yo'l bor, uchalasi ham bitta JSON faylga yig'adi (`pg_dump` kerak emas):

```bash
npm run db:backup                            # zaxira/*.json ga yozadi
npm run db:restore -- zaxira/<fayl>.json     # zaxiradan tiklaydi
```

Panelda **Sozlamalar → Zaxira nusxa** bo'limida "Hozir zaxiralash" tugmasi bor:
fayl markaz egasiga Telegram orqali keladi. Avtomatik bo'lishi uchun cron
kuniga bir marta shu manzilni chaqirsin:

```bash
curl -s -H "x-cron-secret: $CRON_SECRET" https://sizning-domeningiz.uz/api/backup
```

Telegram orqali ketgan nusxada **parol hash'lari bo'lmaydi** — fayl suhbatda
qolib ketishi mumkin. Shuning uchun undan tiklaganda hamma parolni qaytadan
belgilash kerak bo'ladi; to'liq nusxa uchun `npm run db:backup` ishlating.

Zaxira fayllarida bolalar va ota-onalarning shaxsiy ma'lumoti bor — `zaxira/`
papkasi git'ga tushmaydi, uni git'ga qo'shmang.

### Google Sheets zaxira

**Sozlamalar → Google Sheets zaxira**: markaz egasi (yoki yakka logoped o'zi
uchun) bo'sh Google jadvalga tayyor Apps Script qo'yadi, uni "Web app"
(Execute as: Me, Who has access: Anyone) qilib joylaydi va chiqqan `…/exec`
manzilni shu yerga yozadi. Shundan keyin har kuni eslatmalar (yoki zaxira)
cron'i bilan jadvalga hamma ma'lumot yoziladi: Mijozlar, Seanslar, To'lovlar,
Qabullar, Xizmatlar, (markazda) Xodimlar va Ish haqi. Har safar varaqlar
tozalanib, eng so'nggi holat yoziladi. "Hozir yozish" tugmasi ham bor.
Google Cloud kaliti va Vercel sozlamasi kerak emas.

## Keyingi bosqichlar uchun g'oyalar

- Mutaxassisning mashg'ulot kundaligi (har bir seansdan keyin qisqa hisobot)
- Ota-ona Mini App'dan mashg'ulotni bekor qilish / ko'chirish so'rovi
- Bolaning rivojlanish dinamikasi: maqsadlar va natijalar grafigi
- Ish haqi vedomosti (oylik, chop etish uchun)
- Xona (kabinet) bandligi va jadvalda ziddiyatni tekshirish
- Hisobotlarni Excel'ga yuklash

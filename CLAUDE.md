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

Interfeysni inglizcha va ruschaga ham o'tkazish mumkin (`src/lib/i18n/`). Matn
kodda baribir **o'zbekcha** yoziladi, faqat `t()` ga o'raladi — kalit sifatida
o'zbekcha matnning o'zi ishlatiladi:

```tsx
const t = await getT();          // server komponent / action ichida
const t = useT();                // "use client" komponentida
t("Mijozlar")                    // -> "Clients" / "Клиенты"
t("{n} ta seans", { n: 5 })      // o'zgaruvchi qismlar {..} bilan, satrni bo'lib yozmang
t.money(150000)                  // "150 000 so'm" / "150 000 UZS" / "150 000 сум"
t.date(d), t.weekday(d), t.age(birthDate)
```

Yangi matn qo'shsangiz, uning tarjimasini `en.ts` va `ru.ts` ga ham yozing —
`tests/prefs.mjs` buni tekshiradi. Tarjima topilmasa o'zbekchasi ko'rinadi,
sahifa buzilmaydi. `setFlash` va `throw new Error("...")` xabarlari
`setFlash` ichida avtomatik tarjima qilinadi — ularning matni ham lug'atda
bo'lsin. Telegram bot va SMS xabarlari hozircha faqat o'zbekcha (oluvchining
tili noma'lum).

Rejim (tun/kun) `<html>` dagi `dark` klassi bilan boshqariladi, `dark:`
klasslari qurilma mavzusiga emas, shu klassga qaraydi. Kunduzgi rejim ranglari
`globals.css` da Tailwind rang o'zgaruvchilarini almashtirish orqali beriladi
— tungi rejim ranglariga tegmang.

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
npm run db:push       # schema o'zgarishini bazaga yozish va Prisma mijozini yangilash
npm run db:backup     # bazaning to'liq zaxirasi -> zaxira/*.json
npm run db:restore -- zaxira/<fayl>.json    # zaxiradan tiklash
npm run db:clean      # demo'ni tozalab, haqiqiy markazni ochish (savol berib boradi)
npm run db:billing-type  # bir martalik: abonementi bor mijozlarni "Abonement" deb belgilaydi
npm run db:solo-code     # yakka mutaxassis taklif kodini qo'yish / o'chirish
npm run db:timezone   # bir martalik: eski vaqtlarni markaz zonasiga ko'chiradi
npm run db:seed       # demo ma'lumot — DIQQAT, pastga qarang
```

Prisma 7 da `prisma db push` Prisma mijozini **o'zi qayta yasamaydi** — shuning
uchun `db:push` skriptiga `prisma generate` ham qo'shilgan. Uni olib tashlamang:
usiz yangi ustun kodga ko'rinmaydi va "Unknown argument" xatosi chiqadi.

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

## Vaqt zonasi

Markaz **Asia/Tashkent** da, Vercel'dagi server esa UTC da turadi. Zona
`src/instrumentation.ts` da, kodda belgilanadi (muhit o'zgaruvchisiga
tashlanmagan: bir marta yozilmay qolsa butun jadval jimgina 5 soatga siljib
ketardi). Terminaldagi skriptlar va tekshiruvlar uchun `.env` da ham
`TZ="Asia/Tashkent"` turishi kerak.

Shuning uchun:

- Odam kiritgan vaqt (`datetime-local`) markaz vaqti deb tushuniladi.
  `new Date("...T09:00")`, `setHours`, `getHours` — hammasi shu zonada.
- `Session.startsAt` va `Intake.scheduledAt` — odam kiritgan vaqtlar.
  `createdAt`, `sentAt` kabi maydonlar haqiqiy lahza, ularga zona ta'sir
  qilmaydi. Sana-kunlik maydonlar (`birthDate`, `paidAt`) yarim tunda UTC
  bo'lib turadi va ikkala zonada ham o'sha kunni ko'rsatadi.
- Prisma `DateTime` ni PostgreSQL'da zonasiz (`timestamp`) saqlaydi va doim
  UTC deb o'qiydi. Bazaga to'g'ridan-to'g'ri `pg` bilan ulangan kod ham
  shunday o'qishi kerak — `tests/db.mjs` dagi type parser shu uchun.

## Testlar

Brauzerdagi uchidan-uchiga tekshiruvlar, jami 253 ta. Haqiqiy `next build` ustida
ishlaydi va natijani to'g'ridan-to'g'ri bazadan tekshiradi.

```bash
npm run build && npm start -- -p 3100    # boshqa terminalda
node tests/smoke.mjs      # CRM, rollar, qabullar, filiallar, bo'sh vaqtlar, sozlamalar, zaxira, Telegram holati, kunlik to'lov, mijozni o'chirish, to'lovni tuzatish, panel jadvallari, vaqt zonasi, yakka mutaxassis, PWA, kanalga e'lon (173)
node tests/telegram.mjs   # bog'lanish, imzo, mutaxassis Mini App (18)
node tests/parent.mjs     # ota-ona kabineti, eslatmalar, to'lovlar, mutaxassislar, bekor qilish, Farzandim, tun/kun, Telegram'dan tashqari kirish yo'q (29)
node tests/prefs.mjs      # tun/kun rejimi, til, tarjima to'liqligi, logotip (33)
```

Kod o'zgartirgandan keyin shu to'rttasini ishga tushiring. Yangi imkoniyat qo'shsangiz
— unga tekshiruv ham qo'shing.

## Rollar va ko'rish doirasi

| Rol | Ko'radi |
|---|---|
| `OWNER` | hamma filial, hamma narsa; `branchId` bo'sh bo'ladi. Faqat u filial va ikkinchi ega qo'sha oladi (o'zini o'chira olmaydi) |
| `BRANCH_ADMIN` | faqat o'z filiali (hozircha interfeysdan yaratilmaydi) |
| `RECEPTION` | o'z filiali: jadval, qabullar, mijozlar, to'lovlar |
| `SPECIALIST` | faqat o'z mijozlari va o'z puli |
| `PARENT` | faqat o'z farzandi |

`SPECIALIST` ikki xil bo'ladi. Markazdagisi — oddiy xodim. **Yakka
mutaxassis** (`isSolo`, `src/lib/auth.ts`) esa markazga tegishli emas: u
`/royxat` dan taklif kodi bilan o'zi ro'yxatdan o'tadi, o'ziga alohida filial
ochiladi (`Branch.isSolo`), ulushi 100%, mijozini o'zi qo'shadi va to'lovini
o'zi yozadi.

Yakka mutaxassis o'ziga o'zi rahbar, shuning uchun u telefon kabinetiga emas,
**rahbar paneliga** tushadi (`homePath()`): Panel, Jadval, Bo'sh vaqtlar,
Qabullar, Mijozlar, To'lovlar, Hisobotlar, Sozlamalar — faqat Xodimlar va
Filiallarsiz. Rahbar sahifalari `requireManager()` bilan himoyalanadi (ega,
filial admini yoki yakka). Panel va hisobotda "mutaxassis haqi / markaz
ulushi" ko'rinmaydi — pulning hammasi o'ziniki. Qabulda "kim ko'radi" so'ralmaydi,
server uni o'ziga yozadi. Seans narxini Sozlamalardan o'zi o'zgartiradi
(`Specialist.defaultPrice`).

Taklif kodi markaz panelida **ko'rinmaydi** — yakka mutaxassis markazga
tegishli emas, uni markaz rahbari emas, ilovani sotayotgan odam qabul qiladi.
Kod terminaldan qo'yiladi: `npm run db:solo-code -- <kod>` (ko'rish uchun
argumentsiz, yopish uchun `-- --yop`). Kod bo'sh bo'lsa `/royxat` ochilmaydi
va `/login` da ro'yxatdan o'tish havolasi ham ko'rinmaydi.

**Yakka mutaxassisning ishi markaznikiga aralashmasligi kerak.** Doira bitta
joyda — `NOT_SOLO` va `branchWhere()` da. Filial bo'yicha so'rov yozsangiz,
`branchId ? { branchId } : {}` deb yozmang: bo'sh obyekt begona yakka
mutaxassisning mijozlari va pulini ham qamrab oladi. Doim `branchWhere()`
ishlating, filiallar ro'yxatiga esa `NOT_SOLO`.

**Doira har bir so'rovda serverda qo'llanadi** (`src/lib/auth.ts` dagi `clientScope`,
`sessionScope`). Hech qachon faqat interfeysda yashirish bilan cheklanmang —
foydalanuvchi manzilni qo'lda yozishi mumkin.

## Pul mantig'i

Buni o'zgartirishdan oldin tushunib oling:

- **To'lov** mijozdan markazga keladi. Mijozga va (ixtiyoriy) abonementga bog'lanadi,
  **mutaxassisga emas**.
- **Mutaxassisning ish haqi** to'lovdan emas, **bajarilgan seansdan** hisoblanadi:
  seans narxi × foizi, seans "O'tdi/Kelmadi" deb belgilangan payt.
- **Mijozning to'lov turi** `Client.billingType`: `DAILY` (standart — har kelganida
  to'laydi) yoki `PACKAGE` (abonement oladi). Kunlik mijozda abonement, qolgan seans
  va qarzdorlik tushunchasi yo'q — interfeys ham, eslatmalar ham unga bu narsalarni
  ko'rsatmaydi.
- **Seans narxi** abonementdan olinadi; abonement bo'lmasa Sozlamalardagi standart
  narx qo'llanadi. Narx ham seans bilan birga saqlanadi.
- `billingType` ustuni keyin qo'shilgani uchun eski bazada hamma `DAILY` bo'lib
  qoladi. `npm run db:billing-type` abonementi borlarni bir marta `PACKAGE` ga
  o'tkazadi.
- **Foiz seans bilan birga saqlanadi** (`Session.salaryPercent`). Keyin mutaxassisning
  foizi o'zgarsa, o'tib bo'lgan seanslarning hisobi o'zgarmaydi. Buni buzmang.
- Abonement tugashi va qarzdorlik `src/lib/stats.ts` da hisoblanadi.
- **Qabul (konsultatsiya) puli** `Payment` jadvaliga tushmaydi (qabul hali mijoz
  emas) — summa `Intake.price` da turadi. Lekin u ham kassaga tushgan pul, shuning
  uchun `getOverview().collected` ga qo'shiladi va To'lovlar sahifasida alohida
  ro'yxat bo'lib ko'rinadi. Hisobotda "Konsultatsiyalardan" deb ajratib ham
  ko'rsatiladi. Bu uch joydagi raqam bir xil bo'lishi kerak.

**Mijozni o'chirish** ikki xil (ikkalasi ham faqat egada, bolaning ismini
yozib tasdiqlanadi):
- *Shaxsiy ma'lumotni tozalash* — ism, telefon, tashxis o'chadi, seans va
  to'lov yozuvlari qoladi. Kassa va ish haqi hisobi o'zgarmaydi.
- *Butunlay o'chirish* — mijoz bilan birga seans, to'lov, abonement va eslatma
  ketadi (bazada `onDelete: Cascade`), ya'ni o'tgan oylardagi hisobot ham
  o'zgaradi. Qabul (`Intake`) o'chmaydi — undan kelgan konsultatsiya puli
  kassada qolishi kerak, shuning uchun avval mijozdan uziladi.

Yangi jadval qo'shsangiz, uni `prisma/tables.ts` ga ham qo'shing — aks holda
`db:backup` uni zaxiraga olmaydi va `db:seed` tozalashda chet el kaliti xatosi
beradi.

## Ota-ona kabineti (Telegram Mini App)

Ota-ona botga `/start` yuborib raqamini ulashadi, "Kabinetni ochish" tugmasi
`/tg` orqali `/m` ga olib boradi (`src/app/m/parent.tsx`). Bo'limlar: Farzandim,
Jadval, Davomat, To'lovlar, Abonement, Mutaxassislar.

- **Ota-ona faqat Telegram orqali kiradi.** `/login` uni parol bilan
  kiritmaydi (`error=telegram`), katta panel (`(app)` layout) uni `/m` ga
  qaytaradi. Kabinetda "To'liq ko'rinish", "Parol" va "Chiqish" yo'q.
- Kabinet ranglari (`.app-*`, `globals.css`) Telegram mavzusidan
  (`--tg-theme-*`) olinmaydi — aks holda tun/kun tugmasi ishlamaydi.
  Telegram sarlavhasi rejimga `src/app/m/tg-theme.tsx` orqali moslanadi.

- `Session.note` — xodimlarning ichki izohi, ota-onaga hech qachon
  ko'rsatilmaydi. (Ota-onaga izoh / uyga vazifa bir marta qo'shilib, jonli
  bazaga `db:push` qilinmagani uchun Panel yiqilgan va olib tashlangan.
  Qaytarilsa — yangi ustun bilan birga, merge'dan keyin darhol `db:push`.)
- **Ota-ona bekor qilishi** — holat `CANCELLED_CLIENT` (abonementdan
  yechilmaydi), sabab `note` ga qo'shiladi, mutaxassis va filial xodimlariga
  Telegram xabar boradi. Mashg'ulotga `PARENT_CANCEL_MIN_HOURS` dan kam qolsa
  bekor qilib bo'lmaydi — markazga qo'ng'iroq qilinadi.
- **Kanalga e'lon** — Sozlamalarda (ega va yakka logoped) bot nomidan
  ota-onalar kanaliga "Kabinetni ochish" tugmali post qo'yiladi
  (`postToChannel`, `src/lib/telegram.ts`). Kanalda `web_app` tugmasi
  ishlamaydi, shuning uchun tugma `t.me/<bot>?start=kanal` havolasi — avval
  raqam ulashiladi. Bot username kodda yozilmaydi, `getMe` dan olinadi.
- Odam yozgan matnni Telegram xabariga qo'yganda `escapeHtml` dan o'tkazing
  (`src/lib/notify.ts`) — xabarlar HTML rejimida ketadi.

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

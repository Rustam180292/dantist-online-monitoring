/**
 * Uchidan-uchiga (end-to-end) tekshiruv: brauzerda kirish, davomat belgilash,
 * seans qo'shish, to'lov qabul qilish va rollarning chegaralari.
 *
 * Ishga tushirish:
 *   npm run db:reset
 *   npm run build && npm start -- -p 3100   (boshqa terminalda)
 *   npm i -D playwright && npx playwright install chromium   (bir martalik)
 *   node tests/smoke.mjs
 *
 * Manzilni o'zgartirish:  BASE_URL=http://localhost:3000 node tests/smoke.mjs
 */
import playwright from "playwright";
import { all, closeDb, count, one } from "./db.mjs";

const { chromium } = playwright;
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "parol123";

// Farzandi bor ota-onani olamiz: farzandsiz ota-ona akkaunti ham bo'lishi
// mumkin (mijozning telefoni keyin o'zgartirilgan bo'lsa).
const parent = await one(
  `SELECT u.phone FROM User u JOIN Client c ON c.parentUserId = u.id
    WHERE u.role = 'PARENT' GROUP BY u.phone LIMIT 1`,
);
const specialist = await one("SELECT phone FROM User WHERE role='SPECIALIST' LIMIT 1");
const owner = await one("SELECT phone FROM User WHERE role='OWNER' LIMIT 1");
const reception = await one("SELECT phone, fullName FROM User WHERE role='RECEPTION' AND isActive = true LIMIT 1");


/**
 * Ruxsatsiz sahifa boshqa manzilga qaytarishini kutadi.
 *
 * Sahifalarda "skelet" (loading.tsx) borligi uchun Next avval shu skeletni
 * yuboradi, qaytarish esa undan keyin keladi. Shuning uchun manzilni darhol
 * emas, o'rnashguncha kutib tekshiramiz. Sahifaning o'zi hech qachon
 * chizilmaydi — faqat skelet ko'rinib qoladi.
 */
async function denied(label, path, mustNotContain) {
  await page.goto(`${BASE}${path}`);
  const left = await page
    .waitForURL((url) => !url.pathname.startsWith(path), { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  await page.waitForLoadState("networkidle");
  const body = await page.content();
  check(
    label,
    left && !body.includes(mustNotContain),
    `${page.url()}${left ? "" : " — qaytarilmadi"}`,
  );
}

/** Shart bajarilishini kutadi (server action fon rejimida tugashi uchun) */
async function waitUntil(fn, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await fn()) return true;
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, 200));
  }
}

// Sinovlar bazadagi vaqtni soat bilan solishtiradi — jarayon markaz zonasida
// ishlamasa, natija noto'g'ri bo'ladi. .env dagi TZ shuning uchun kerak.
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
if (tz !== "Asia/Tashkent") {
  console.error(`Vaqt zonasi "${tz}" — .env ga TZ="Asia/Tashkent" qo'shing.`);
  process.exit(1);
}

const ok = [];
const fails = [];
const check = (name, cond, extra = "") =>
  (cond ? ok : fails).push(`${name}${extra ? ` — ${extra}` : ""}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const failedRequests = [];
page.on("requestfailed", (r) =>
  failedRequests.push({ url: r.url(), error: r.failure()?.errorText ?? "" }),
);
page.on("pageerror", (e) =>
  fails.push(`JS xatolik @ ${page.url()}: ${e.message.split("\n")[0]}`),
);
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const text = m.text();
  // Resurs yuklanmagani pastda requestfailed orqali alohida tekshiriladi:
  // sinov muhitida telegram.org ga chiqish yopiq, bu ilovaning kamchiligi emas.
  if (text.includes("favicon")) return;
  if (text.includes("Failed to load resource") || text.trim() === "Event") return;
  fails.push(`Konsol xatosi @ ${page.url()}: ${text.split("\n")[0]}`);
});

async function login(phone, password = PASSWORD) {
  await ctx.clearCookies();
  await page.goto(`${BASE}/login`);
  await page.fill("#phone", phone);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForLoadState("networkidle");
}

/* 0. Login: parolni ko'rib tekshirish mumkin */
{
  await page.goto(`${BASE}/login`);
  await page.fill("#password", "Qabul12");
  const typeOf = () => page.locator("#password").getAttribute("type");
  const hidden = (await typeOf()) === "password";
  await page.click('[data-testid="password-toggle"]');
  const shown = (await typeOf()) === "text" && (await page.inputValue("#password")) === "Qabul12";
  await page.click('[data-testid="password-toggle"]');
  check("Login: parolni ko'rsatish/yashirish", hidden && shown && (await typeOf()) === "password");
}

/* 1. Himoyalangan sahifa login'ga yo'naltiradi */
await page.goto(`${BASE}/`);
check("Auth: / -> /login", page.url().includes("/login"), page.url());

// Sayt internetda ochiq turadi: demo hisoblar ro'yxati ko'rinib tursa,
// istalgan odam markaz egasi sifatida kira oladi.
check(
  "Demo hisoblar ro'yxati ishlab turgan saytda ko'rinmaydi",
  !(await page.content()).includes("Demo kirish"),
  page.url(),
);

/* 2. Noto'g'ri parol rad etiladi */
await login(owner.phone, "notogri-parol");
check("Noto'g'ri parol rad etiladi", (await page.content()).includes("noto'g'ri"));

/* 3. Markaz egasi kiradi */
await login(owner.phone);
check("Markaz egasi kirdi", (await page.content()).includes("Assalomu alaykum"), page.url());

/* 4. Davomat belgilash */

/** Sana qaysi haftaga tushishini hisoblaydi (0 = shu hafta) */
const mondayOf = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
};
const weekOffsetOf = (date) =>
  Math.round((mondayOf(date) - mondayOf(new Date())) / (7 * 86400000));

// Joriy haftada rejadagi seans qolmagan bo'lishi mumkin (masalan hafta oxirida),
// shuning uchun eng yaqin rejadagi seansni topib, o'sha haftaga o'tamiz.
const nextPlanned = await one(
  "SELECT startsAt FROM Session WHERE status='PLANNED' ORDER BY startsAt ASC LIMIT 1",
);
const plannedWeek = nextPlanned ? weekOffsetOf(nextPlanned.startsAt) : 0;

await page.goto(`${BASE}/schedule?w=${plannedWeek}`);
await page.waitForLoadState("networkidle");
const doneBefore = await count("SELECT COUNT(*) AS n FROM Session WHERE status='DONE'");
const doneBtn = page.locator('form button:has-text("O\'tdi")').first();
if (await doneBtn.count()) {
  await doneBtn.click();
  const grew = await waitUntil(
    async () => await count("SELECT COUNT(*) AS n FROM Session WHERE status='DONE'") === doneBefore + 1,
  );
  check("Davomat \"O'tdi\" deb belgilanadi", grew, `${doneBefore} -> ${await count("SELECT COUNT(*) AS n FROM Session WHERE status='DONE'")}`);
} else {
  check("Davomat belgilash", false, "rejadagi seans topilmadi");
}

/* 5. Yangi seans qo'shish */
await page.goto(`${BASE}/schedule?w=1`);
const sessBefore = await count("SELECT COUNT(*) AS n FROM Session");
await page.click('summary:has-text("Yangi seans")');

// Mijoz va mutaxassis bitta filialdan bo'lishi kerak — ataylab mos juftlikni tanlaymiz
const pair = await one(
  `SELECT c.id AS clientId, sp.id AS specialistId
     FROM Client c
     JOIN Specialist sp ON sp.branchId = c.branchId AND sp.isActive = true
    WHERE c.status = 'ACTIVE'
    LIMIT 1`,
);
await page.selectOption("#clientId", pair.clientId);
await page.selectOption("#specialistId", pair.specialistId);

// Har yurishda bo'sh vaqt tanlaymiz: dastur band vaqtga seans qo'shishga to'g'ri
// yo'l qo'ymaydi, shuning uchun test ham har safar yangi kunni oladi.
const soon = new Date();
soon.setDate(soon.getDate() + 30 + (sessBefore % 60));
await page.fill("#startsAt", `${soon.toISOString().slice(0, 10)}T19:15`);
await page.click('form button:has-text("Qo\'shish")');
const sessGrew = await waitUntil(
  async () => await count("SELECT COUNT(*) AS n FROM Session") === sessBefore + 1,
);
check("Yangi seans qo'shildi", sessGrew, `${sessBefore} -> ${await count("SELECT COUNT(*) AS n FROM Session")}`);

/* 6. Mijozlar ro'yxati va kartasi */
await page.goto(`${BASE}/clients`);
check("Mijozlar ro'yxati to'ldi", (await page.locator("tbody tr").count()) > 0);
// Abonement bo'limi faqat abonementchi mijozda bo'ladi — ataylab o'shanaqasini
// ochamiz, pastdagi to'lov va abonement tekshiruvlari shu kartada ishlaydi
const pkgClient = await one("SELECT id FROM Client WHERE billingType = 'PACKAGE' LIMIT 1");
await page.goto(`${BASE}/clients/${pkgClient.id}`);
await page.waitForLoadState("networkidle");
check("Mijoz kartasi ochildi", (await page.content()).includes("Abonementlar"), page.url());

/* 7. To'lov qabul qilish */
const payBefore = await count("SELECT COUNT(*) AS n FROM Payment");
await page.click('summary:has-text("To\'lov qabul qilish")');
await page.fill("#amount", "250000");
await page.click('form button:has-text("Qabul qilish")');
// Summa bir nechta qarzdor abonementga taqsimlanishi mumkin, shuning uchun
// "aynan bitta yozuv" emas, "yozuv qo'shildi" deb tekshiramiz
const payGrew = await waitUntil(
  async () => await count("SELECT COUNT(*) AS n FROM Payment") > payBefore,
);
check("To'lov qabul qilindi", payGrew, `${payBefore} -> ${await count("SELECT COUNT(*) AS n FROM Payment")}`);

/* 8. Abonement sotish */
const pkgBefore = await count("SELECT COUNT(*) AS n FROM Package");
await page.click('summary:has-text("Abonement sotish")');
await page.fill("#pricePerSession", "130000");
await page.click('form button:has-text("Sotish")');
const pkgGrew = await waitUntil(
  async () => await count("SELECT COUNT(*) AS n FROM Package") === pkgBefore + 1,
);
check("Abonement sotildi", pkgGrew, `${pkgBefore} -> ${await count("SELECT COUNT(*) AS n FROM Package")}`);

/* 9. Qolgan sahifalar ochiladi */
for (const [path, marker] of [
  ["/specialists", "Ish haqi"],
  ["/payments", "Jami tushum"],
  ["/reports", "Markaz ulushi"],
]) {
  const res = await page.goto(`${BASE}${path}`);
  check(
    `Sahifa ${path}`,
    res.status() === 200 && (await page.content()).includes(marker),
    `status ${res.status()}`,
  );
}

/* 9a. To'lovlar sahifasidan qo'lda to'lov kiritish (qarzni yopadi) */
{
  const packageDebt = (packageId) =>
    count(
      `SELECT (p.totalSessions * p.pricePerSession)
              - COALESCE((SELECT SUM(amount) FROM Payment WHERE packageId = p.id), 0) AS n
         FROM Package p WHERE p.id = ?`,
      packageId,
    );

  const debtor = await one(
    `SELECT c.id AS clientId, c.fullName AS clientName, p.id AS packageId
       FROM Package p
       JOIN Client c ON c.id = p.clientId
      WHERE p.isActive = true AND c.status = 'ACTIVE'
        AND (p.totalSessions * p.pricePerSession) >
            COALESCE((SELECT SUM(amount) FROM Payment WHERE packageId = p.id), 0)
      ORDER BY p.purchasedAt ASC
      LIMIT 1`,
  );

  if (!debtor) {
    check("To'lovlar sahifasidan to'lov kiritiladi", false, "qarzdor topilmadi");
  } else {
    const debtBefore = await packageDebt(debtor.packageId);
    const paymentsBefore = await count("SELECT COUNT(*) AS n FROM Payment");

    await page.goto(`${BASE}/payments`);
    await page.waitForLoadState("networkidle");
    await page.click('summary:has-text("To\'lov qabul qilish")');
    await page.selectOption("#clientId", debtor.clientId);
    await page.fill("#amount", String(debtBefore));
    await page.click('form button:has-text("Qabul qilish")');

    const paid = await waitUntil(
      async () => await count("SELECT COUNT(*) AS n FROM Payment") > paymentsBefore,
    );
    check(
      "To'lovlar sahifasidan to'lov kiritiladi",
      paid,
      `${paymentsBefore} -> ${await count("SELECT COUNT(*) AS n FROM Payment")}`,
    );
    check(
      "To'lov qarzni avtomatik yopadi",
      (await packageDebt(debtor.packageId)) === 0,
      `qarz: ${debtBefore} -> ${await packageDebt(debtor.packageId)}`,
    );
  }
}

/* 9b. Mutaxassisga ish haqi to'lab berish */
await page.goto(`${BASE}/specialists`);
await page.waitForLoadState("networkidle");
const payoutBefore = await count("SELECT COUNT(*) AS n FROM SalaryPayout");
const payRow = page
  .locator("form")
  .filter({ has: page.locator('button:has-text("to\'lash")') })
  .first();
if (await payRow.count()) {
  await payRow.locator('input[name="amount"]').fill("100000");
  await payRow.locator('button:has-text("to\'lash")').click();
  const payoutGrew = await waitUntil(
    async () => await count("SELECT COUNT(*) AS n FROM SalaryPayout") === payoutBefore + 1,
  );
  check(
    "Ish haqi to'lab berildi",
    payoutGrew,
    `${payoutBefore} -> ${await count("SELECT COUNT(*) AS n FROM SalaryPayout")}`,
  );
  // Ekrandagi matnni page.content() orqali emas, innerText orqali o'qiymiz:
  // content() HTML qaytaradi va u yerda uzilmas probel "&nbsp;" ga aylanib
  // qoladi, ya'ni "100 000 so'm" hech qachon topilmasdi.
  // Amal tugagach ro'yxat bir zumdan keyin yangilanadi — shuning uchun kutamiz.
  const listed = await waitUntil(async () =>
    (await page.locator("main").innerText()).replace(/\u00a0/g, " ").includes("100 000 so'm"),
  );
  check("Ish haqi to'lovi ro'yxatda ko'rinadi", listed);
} else {
  check("Ish haqi to'lab berildi", false, "to'lash tugmasi topilmadi");
}

/* 9c. Mutaxassis o'z pulini ko'radi */
{
  const specRow = await one(
    "SELECT s.id FROM Specialist s JOIN User u ON u.id = s.userId WHERE u.phone = ? LIMIT 1",
    specialist.phone,
  );
  const accrued = await count(
    `SELECT COALESCE(SUM(CAST(price * COALESCE(salaryPercent, 0) / 100 AS INTEGER)), 0) AS n
       FROM Session WHERE specialistId = '${specRow.id}' AND status IN ('DONE','NO_SHOW')`,
  );
  check("Mutaxassisga ish haqi hisoblangan", accrued > 0, `${accrued} so'm`);
}

/* 9d. PWA: telefon bosh ekraniga o'rnatish uchun kerakli fayllar */
{
  const manifestRes = await fetch(`${BASE}/manifest.webmanifest`);
  const manifest = await manifestRes.json().catch(() => ({}));
  check(
    "Manifest fayli beriladi",
    manifestRes.status === 200 &&
      manifest.display === "standalone" &&
      Array.isArray(manifest.icons) &&
      manifest.icons.length >= 2,
    `status ${manifestRes.status}`,
  );
  check(
    "Maskable ikonka bor",
    (manifest.icons ?? []).some((i) => i.purpose === "maskable"),
  );

  for (const path of ["/sw.js", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/offline.html"]) {
    const res = await fetch(`${BASE}${path}`);
    check(`PWA fayli ${path}`, res.status === 200, `status ${res.status}`);
  }

  // Android ilovasi (APK) uchun assetlinks: sozlanmagan bo'lsa yo'q,
  // sozlangan bo'lsa .env dagi Package ID va kalit izini qaytaradi
  {
    const res = await fetch(`${BASE}/.well-known/assetlinks.json`);
    const pkg = process.env.ANDROID_PACKAGE_NAME?.trim();
    if (pkg && process.env.ANDROID_SHA256_FINGERPRINTS?.trim()) {
      const body = await res.json().catch(() => []);
      check(
        "assetlinks.json Android ilovasini tasdiqlaydi",
        res.status === 200 && body[0]?.target?.package_name === pkg &&
          body[0]?.target?.sha256_cert_fingerprints?.length > 0,
        `status ${res.status}`,
      );
    } else {
      check("assetlinks.json sozlanmaganda berilmaydi", res.status === 404, `status ${res.status}`);
    }
  }

  // Xizmat ishchisi brauzerda haqiqatan ro'yxatdan o'tadimi
  await page.goto(`${BASE}/install`);
  await page.waitForLoadState("networkidle");
  check(
    "O'rnatish sahifasi ochiladi",
    (await page.content()).includes("bosh ekraniga o"),
    page.url(),
  );

  const swReady = await page
    .waitForFunction(
      async () => {
        if (!("serviceWorker" in navigator)) return false;
        const regs = await navigator.serviceWorker.getRegistrations();
        return regs.length > 0;
      },
      null,
      { timeout: 8000 },
    )
    .then(() => true)
    .catch(() => false);
  check("Xizmat ishchisi ro'yxatdan o'tadi", swReady);

  // Telefon o'lchamidagi ekranda yon menyu yashiringani uchun taklif sahifa ustida chiqadi
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/schedule`);
  await page.waitForLoadState("networkidle");
  check(
    "Telefonda panelda o'rnatish taklifi ko'rinadi",
    await page
      .locator('main a[href="/install"], main button:has-text("rnatish")')
      .first()
      .isVisible(),
    page.url(),
  );
  await page.setViewportSize({ width: 1280, height: 900 });
}

/* 9e. Tekshiruv xatosi foydalanuvchiga tushunarli xabar bo'lib ko'rinadi */
{
  // Band telefon raqam bilan mutaxassis qo'shishga urinamiz
  const taken = await one("SELECT phone FROM User WHERE role='SPECIALIST' LIMIT 1");
  const specBefore = await count("SELECT COUNT(*) AS n FROM Specialist");

  await page.goto(`${BASE}/specialists`);
  await page.waitForLoadState("networkidle");
  await page.click('summary:has-text("Yangi mutaxassis")');
  await page.fill("#fullName", "Sinov Xodimov");
  await page.fill("#phone", taken.phone);
  await page.fill("#password", "parol123");
  await page.locator('form button:has-text("Qo\'shish")').first().click();

  // Next.js sahifa o'zgarishini e'lon qiladigan yashirin element ham role="alert"
  // bo'ladi, shuning uchun aynan matni bor xabarni kutamiz.
  const banner = page.getByRole("alert").filter({ hasText: "allaqachon" });
  const shown = await banner
    .waitFor({ state: "visible", timeout: 8000 })
    .then(() => true)
    .catch(() => false);

  const text = shown ? await banner.innerText() : "";
  check(
    "Tekshiruv xatosi tushunarli xabar bilan ko'rsatiladi",
    shown && !text.includes("%"),
    text.replace(/\n/g, " ") || "xabar chiqmadi",
  );
  check(
    "Xato bo'lganda yozuv qo'shilmaydi",
    (await count("SELECT COUNT(*) AS n FROM Specialist")) === specBefore,
  );
  check(
    "Xato butun sahifani almashtirmaydi",
    (await page.content()).includes("Ish haqi"),
    page.url(),
  );
}

/* 9f. Ikkinchi "markaz egasi" akkaunti */
{
  // Har safar yangi raqam: test qayta ishga tushganda "raqam band" bo'lib qolmasin
  const phone = `+99890${String(Date.now()).slice(-7)}`;

  await page.goto(`${BASE}/specialists`);
  await page.waitForLoadState("networkidle");

  check(
    "O'z egalik akkauntini o'chirish tugmasi yo'q",
    (await page.locator('li:has-text("(siz)") form button').count()) === 0,
  );

  await page.click('summary:has-text("Egalik akkaunti")');
  await page.fill("#oFullName", "Sherik Hamkorov");
  await page.fill("#oPhone", phone);
  await page.fill("#oPassword", PASSWORD);
  await page.locator("form:has(#oPhone) button[type=submit]").click();

  const added = await waitUntil(
    async () =>
      (await count(`SELECT COUNT(*) AS n FROM User WHERE phone='${phone}' AND role='OWNER'`)) === 1,
  );
  check("Ikkinchi markaz egasi qo'shiladi", added, phone);

  const row = added ? await one(`SELECT branchId FROM User WHERE phone='${phone}'`) : null;
  check("Yangi ega biror filialga bog'lanmaydi", row !== null && row.branchId === null);

  // Haqiqatan kirib, to'liq panelni ko'radimi
  await login(phone);
  await page.goto(`${BASE}/reports`);
  await page.waitForLoadState("networkidle");
  check(
    "Yangi ega hisobotlarni ko'radi",
    (await page.content()).includes("Filiallar kesimi"),
    page.url(),
  );

  await login(owner.phone);
}

/* 9g. Mijozlar jadvalidagi filtr qatori */
{
  await page.goto(`${BASE}/clients`);
  await page.waitForLoadState("networkidle");
  const all = await page.locator("tbody tr").count();

  // "Kam (1-2)" ba'zan bo'sh bo'ladi (abonementchilar kam), "Yetarli (3+)" esa
  // doim bo'ladi — filtr ishlayotganini shu bilan tekshiramiz
  await page.selectOption("select[aria-label=\"Qolgan seans bo'yicha filtr\"]", "ok");
  const inUrl = await waitUntil(async () => page.url().includes("rem=ok"));
  await page.waitForLoadState("networkidle");
  const few = await page.locator("tbody tr").count();

  check("Filtr manzilga yoziladi (havolani ulashish mumkin)", inUrl, page.url());
  check(
    "Qolgan seans bo'yicha filtr ro'yxatni qisqartiradi",
    few > 0 && few < all,
    `${all} -> ${few}`,
  );

  // "Tozalash" hammasini qaytaradi
  await page.click('button:has-text("Tozalash")');
  const cleared = await waitUntil(async () => !page.url().includes("rem="));
  await page.waitForLoadState("networkidle");
  check(
    "Tozalash filtrlarni olib tashlaydi",
    cleared && (await page.locator("tbody tr").count()) === all,
    page.url(),
  );

  // Ism bo'yicha
  const some = await one("SELECT fullName FROM Client ORDER BY fullName LIMIT 1");
  await page.goto(`${BASE}/clients?n=${encodeURIComponent(some.fullName)}`);
  await page.waitForLoadState("networkidle");
  const narrowed = await page.locator("tbody tr").count();
  check(
    "Ism bo'yicha filtr ishlaydi",
    narrowed > 0 && narrowed < all && (await page.locator("main").innerText()).includes(some.fullName),
    `${some.fullName}: ${narrowed} ta`,
  );
}

/* 9q. Mijozlar ro'yxati: "Amallar" ustuni yo'q, tahrirlash shu yerda */
{
  await page.goto(`${BASE}/clients`);
  await page.waitForLoadState("networkidle");
  const headers = await page.locator("thead tr").first().innerText();
  check("Mijozlar jadvalida \"Amallar\" ustuni yo'q", !headers.includes("Amallar"), headers.replace(/\s+/g, " "));

  // Ro'yxatning o'zida tahrirlash: ismni o'zgartirib, keyin qaytaramiz
  const target = await one("SELECT id, fullName FROM Client WHERE status = 'ACTIVE' ORDER BY fullName LIMIT 1");
  const renamed = `${target.fullName} T${String(Date.now()).slice(-4)}`;
  const form = page.locator(`form[data-testid="client-edit-form"]:has(input[name="clientId"][value="${target.id}"])`);
  await form.locator("xpath=ancestor::details[1]").locator("summary").click();
  await form.locator('input[name="fullName"]').fill(renamed);
  await form.locator('button[type="submit"]').click();
  const saved = await waitUntil(
    async () => (await one("SELECT fullName FROM Client WHERE id = ?", target.id))?.fullName === renamed,
  );
  check("Mijozni ro'yxatning o'zidan tahrirlash mumkin", saved, renamed);
  await all("UPDATE Client SET fullName = ? WHERE id = ?", target.fullName, target.id);

  // Ro'yxatdagi "Seans" tugmasi o'rniga mijoz kartasida "Seans yozish" bor —
  // u jadvalga o'tib, mijozni oldindan tanlab beradi
  await page.goto(`${BASE}/clients/${target.id}`);
  await page.waitForLoadState("networkidle");
  await page.locator('a:has-text("Seans yozish")').click();
  await page.waitForURL(/schedule\?yangi=/, { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle");
  const picked = await page.locator('select[name="clientId"]').evaluate((el) => el.value);
  check(
    "Mijoz kartasidagi \"Seans yozish\" jadvalda mijozni tanlab beradi",
    picked === target.id && (await page.locator("#yangi").evaluate((el) => el.open)),
    page.url(),
  );

  // Oddiy ochilganda esa hech kim tanlanmagan bo'ladi
  await page.goto(`${BASE}/schedule`);
  await page.waitForLoadState("networkidle");
  check(
    "Jadvalda yangi seans formasida mijoz oldindan tanlanmagan",
    (await page.locator('select[name="clientId"]').evaluate((el) => el.value)) === "",
  );
}

/* 9q2. Bosh panel jadvallarida qidiruv va tartiblash */
{
  await page.goto(`${BASE}/`);
  await page.waitForLoadState("networkidle");
  const table = page.locator('[data-testid="dash-specialists"]');
  const names = async () =>
    (await table.locator("tbody tr td:first-child").allInnerTexts()).map((x) => x.split("\n")[0].trim());
  const before = await names();
  check("Panelda mutaxassislar jadvali bor", before.length > 1, `${before.length} ta`);

  await table.locator('thead button:has-text("Mutaxassis")').click();
  const asc = await names();
  await table.locator('thead button:has-text("Mutaxassis")').click();
  const desc = await names();
  const sorted = [...asc].sort((x, y) => x.localeCompare(y, "uz", { numeric: true }));
  check(
    "Ustun sarlavhasini bosib tartiblash (o'sish / kamayish)",
    JSON.stringify(asc) === JSON.stringify(sorted) && JSON.stringify(desc) === JSON.stringify([...sorted].reverse()),
    `${asc[0]} … / ${desc[0]} …`,
  );

  await table.locator('input[type="search"]').fill(before[0]);
  const filtered = await names();
  check(
    "Jadval ichida qidirish ishlaydi",
    filtered.length >= 1 && filtered.length < before.length && filtered.every((n) => n.includes(before[0])),
    `${before[0]}: ${filtered.length} ta`,
  );
  await table.locator('input[type="search"]').fill("zzzz-yoq");
  check(
    "Topilmasa xabar chiqadi",
    (await table.locator("tbody").innerText()).includes("Hech narsa topilmadi"),
  );
}

/* 9r. Telegram holati ko'rinib turadi */
{
  // Ulanmagan ota-ona: bosh panelda ogohlantirish bo'lishi kerak
  await page.goto(`${BASE}/`);
  await page.waitForLoadState("networkidle");
  const warn = page.locator('a[href="/clients?tg=yoq"]');
  check("Bosh panelda ulanmagan ota-onalar haqida ogohlantirish", (await warn.count()) === 1);

  await warn.click();
  await page.waitForURL(/tg=yoq/, { timeout: 15000 }).catch(() => {});
  // loading.tsx skeleti tufayli "networkidle" jadval kelgunga qadar ham
  // tinchiydi — qator paydo bo'lishini alohida kutamiz
  await page.waitForSelector("tbody tr", { timeout: 15000 });
  const unlinked = await page.locator("tbody tr").count();
  const bodyText = await page.locator("tbody").first().innerText();
  check(
    "Ogohlantirish ulanmaganlar ro'yxatini ochadi",
    unlinked > 0 && bodyText.includes("Telegram yo'q") && !bodyText.includes("Telegram ulangan"),
    `${unlinked} ta`,
  );

  // Bazaga ulangan ota-ona qo'yib, filtr ikkala tomonga ham ishlashini tekshiramiz
  const someParent = await one(
    "SELECT u.id FROM User u JOIN Client c ON c.parentUserId = u.id WHERE u.role = 'PARENT' LIMIT 1",
  );
  await all("UPDATE User SET telegramId = '999000111' WHERE id = ?", someParent.id);

  await page.goto(`${BASE}/clients?tg=bor`);
  await page.waitForSelector("tbody tr", { timeout: 15000 });
  check(
    "Ulanganlar filtri faqat ulanganlarni ko'rsatadi",
    (await page.locator("tbody tr").count()) > 0 &&
      (await page.locator("tbody").first().innerText()).includes("Telegram ulangan"),
  );

  await page.goto(`${BASE}/clients?tg=yoq`);
  await page.waitForSelector("tbody tr", { timeout: 15000 });
  check(
    "Ulangan mijoz 'ulanmagan' ro'yxatidan chiqib ketadi",
    (await page.locator("tbody tr").count()) < unlinked,
  );

  // Xodimlar sahifasida ham ko'rinsin
  await page.goto(`${BASE}/specialists`);
  await page.waitForLoadState("networkidle");
  check(
    "Xodimlar sahifasida Telegram holati ko'rinadi",
    (await page.locator("main").innerText()).includes("Telegram yo'q"),
  );

  await all("UPDATE User SET telegramId = NULL WHERE id = ?", someParent.id);
}

/* 9s. To'lovlarni bola ismi bo'yicha qidirish */
{
  await page.goto(`${BASE}/payments`);
  await page.waitForSelector("tbody tr", { timeout: 15000 });
  const all = await page.locator("tbody tr").count();

  const paid = await one(
    `SELECT c.fullName FROM Payment p JOIN Client c ON c.id = p.clientId
      ORDER BY p.paidAt DESC LIMIT 1`,
  );
  await page.fill("#q", paid.fullName);
  await page.click('button:has-text("Filtrlash")');
  await page.waitForSelector("tbody tr", { timeout: 15000 });
  const found = await page.locator("tbody tr").count();
  check(
    "To'lovlar bola ismi bo'yicha qidiriladi",
    found > 0 && found < all && page.url().includes("q="),
    `${paid.fullName}: ${all} -> ${found}`,
  );

  await page.click('a:has-text("Tozalash")');
  await page.waitForURL((u) => !u.search.includes("q="), { timeout: 15000 }).catch(() => {});
  await page.waitForSelector("tbody tr", { timeout: 15000 });
  check(
    "To'lovlar filtri tozalanadi",
    !page.url().includes("q=") && (await page.locator("tbody tr").count()) === all,
    page.url(),
  );
}

/* 9t. Abonementsiz (kunlik to'laydigan) mijoz */
{
  // Markaz egasi abonementsiz mijoz qo'shadi va unga seans yozadi
  await page.goto(`${BASE}/clients`);
  await page.waitForSelector("tbody tr", { timeout: 15000 });
  await page.click('summary:has-text("Yangi mijoz")');
  const uniq = Date.now().toString().slice(-6);
  await page.fill("#fullName", `Kunlik Bola ${uniq}`);
  await page.fill("#birthDate", "2020-05-05");
  await page.fill("#parentName", "Kunlik Ota");
  await page.fill("#parentPhone", `+99890777${uniq.slice(-4)}`);
  await page.selectOption("#billingType", "DAILY");
  await page.click('form button:has-text("Saqlash")');
  const made = await waitUntil(
    async () => (await count("SELECT COUNT(*) AS n FROM Client WHERE fullName = ?", `Kunlik Bola ${uniq}`)) === 1,
  );
  check("Abonementsiz mijoz qo'shiladi", made);

  const kid = await one("SELECT id, branchId FROM Client WHERE fullName = ?", `Kunlik Bola ${uniq}`);

  await page.goto(`${BASE}/clients?n=${encodeURIComponent("Kunlik Bola " + uniq)}`);
  await page.waitForSelector("tbody tr", { timeout: 15000 });
  check(
    "Abonementsiz mijoz 'kunlik' deb ko'rsatiladi",
    (await page.locator("tbody").first().innerText()).includes("kunlik"),
  );

  // "Tugagan (0)" filtri unga tegmasligi kerak — uning abonementi yo'q
  await page.goto(`${BASE}/clients?rem=0`);
  await page.waitForLoadState("networkidle");
  check(
    "Kunlik mijoz 'tugagan' ro'yxatiga tushmaydi",
    !(await page.locator("main").innerText()).includes(`Kunlik Bola ${uniq}`),
  );

  // To'lov turi bo'yicha filtr
  await page.goto(`${BASE}/clients?bt=PACKAGE`);
  await page.waitForLoadState("networkidle");
  check(
    "To'lov turi bo'yicha filtr ishlaydi",
    !(await page.locator("main").innerText()).includes(`Kunlik Bola ${uniq}`) &&
      (await page.locator("tbody tr").count()) > 0,
    page.url(),
  );

  // Mijoz kartasida kunlikka abonement sotish formasi ko'rinmasligi kerak
  await page.goto(`${BASE}/clients/${kid.id}`);
  await page.waitForLoadState("networkidle");
  const cardText = await page.locator("main").innerText();
  check(
    "Kunlik mijoz kartasida abonement sotish taklif qilinmaydi",
    cardText.includes("har kelganida to'laydi") && !cardText.includes("+ Abonement sotish"),
  );

  // Turini "Abonement" ga o'zgartirsak, forma qaytib keladi
  await page.selectOption('select[name="billingType"]', "PACKAGE");
  await page.click('form button:has-text("Saqlash")');
  const switched = await waitUntil(async () => {
    const r = await one("SELECT billingType FROM Client WHERE id = ?", kid.id);
    return r?.billingType === "PACKAGE";
  });
  await page.goto(`${BASE}/clients/${kid.id}`);
  await page.waitForLoadState("networkidle");
  check(
    "Abonementga o'tkazilsa abonement bo'limi ochiladi",
    switched && (await page.locator("main").innerText()).includes("Abonement sotish"),
  );
  // Qolgan tekshiruvlar uchun kunlikka qaytaramiz
  await all("UPDATE Client SET billingType = 'DAILY' WHERE id = ?", kid.id);

  // Seans yozib, "O'tdi" deb belgilaymiz: narx standart narxdan olinishi kerak
  const sp = await one(
    "SELECT id FROM Specialist WHERE branchId = ? AND isActive = true LIMIT 1",
    kid.branchId,
  );
  // Har yurishda boshqa kun olamiz: dastur band vaqtga seans qo'shishga yo'l
  // qo'ymaydi, test esa bitta baza ustida bir necha marta ishlashi mumkin
  const seansCount = await count("SELECT COUNT(*) AS n FROM Session");
  const day = new Date();
  day.setDate(day.getDate() + 3 + (seansCount % 20));
  // toISOString UTC beradi — mahalliy sanani o'zimiz yig'amiz
  const ymd = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(
    day.getDate(),
  ).padStart(2, "0")}`;
  const when = `${ymd}T06:05`;

  await page.goto(`${BASE}/schedule`);
  await page.waitForLoadState("networkidle");
  await page.click('summary:has-text("Yangi seans")');
  await page.selectOption("#clientId", kid.id);
  await page.selectOption("#specialistId", sp.id);
  await page.fill("#startsAt", when);
  await page.click('form button:has-text("Qo\'shish")');
  const added = await waitUntil(
    async () => (await count("SELECT COUNT(*) AS n FROM Session WHERE clientId = ?", kid.id)) === 1,
  );
  check(
    "Kunlik mijozga seans yoziladi",
    added,
    added ? "" : (await page.locator("main").innerText()).split("\n").slice(0, 3).join(" | "),
  );

  const sess = added
    ? await one("SELECT id, startsAt FROM Session WHERE clientId = ? LIMIT 1", kid.id)
    : null;

  // Vaqt zonasi: "06:05" deb kiritilgani markaz vaqti bo'yicha tushunilishi
  // kerak, server zonasi bo'yicha emas. Server UTC da qolib ketsa, bazadagi
  // soat kiritilgani bilan bir xil bo'ladi va bu shart yiqiladi.
  if (sess) {
    const at = new Date(sess.startsAt);
    const shift = (at.getHours() - at.getUTCHours() + 24) % 24;
    check(
      "Kiritilgan vaqt markaz zonasida saqlanadi",
      at.getHours() === 6 && at.getMinutes() === 5 && shift === 5,
      `${at.toISOString()} -> ${at.getHours()}:${String(at.getMinutes()).padStart(2, "0")}, farq ${shift} soat`,
    );
  }

  if (!sess) {
    check("Kunlik seansning narxi standart narxdan olinadi", false, "seans yozilmadi");
  } else {
  await page.goto(`${BASE}/schedule?w=${weekOffsetOf(day)}`);
  await page.waitForLoadState("networkidle");
  const card = page
    .locator("li, div")
    .filter({ hasText: `Kunlik Bola ${uniq}` })
    .filter({ has: page.locator('form button:has-text("O\'tdi")') })
    .last();
  await card.locator('form button:has-text("O\'tdi")').first().click();

  const priced = await waitUntil(async () => {
    const r = await one("SELECT price FROM Session WHERE id = ?", sess.id);
    return Number(r?.price ?? 0) > 0;
  });
  const got = await one("SELECT price FROM Session WHERE id = ?", sess.id);
  // Standart narxni Sozlamalar sahifasidan olamiz: bazada Settings qatori hali
  // yozilmagan bo'lishi mumkin, u holda kod ichidagi standart qiymat ishlaydi
  await page.goto(`${BASE}/settings`);
  await page.waitForSelector("#defaultPrice", { timeout: 15000 });
  const standard = Number(await page.inputValue("#defaultPrice"));
  check(
    "Kunlik seansning narxi standart narxdan olinadi",
    priced && Number(got.price) === standard,
    `${got?.price} / standart ${standard}`,
  );
  }
}

/* 9u. Mijozni tozalash va butunlay o'chirish */
{
  // Tozalash uchun alohida mijoz yasaymiz: tekshiruvning qolgan qismi
  // seed'dagi mijozlarga tayanadi, ularga tegmaymiz
  const makeClient = async (name, phone) => {
    await page.goto(`${BASE}/clients`);
    await page.waitForSelector("tbody tr", { timeout: 15000 });
    await page.click('summary:has-text("Yangi mijoz")');
    await page.fill("#fullName", name);
    await page.fill("#birthDate", "2019-03-03");
    await page.fill("#parentName", "Test Ota");
    await page.fill("#parentPhone", phone);
    await page.fill("#parentPassword", PASSWORD);
    await page.click('form button:has-text("Saqlash")');
    await waitUntil(
      async () => (await count("SELECT COUNT(*) AS n FROM Client WHERE fullName = ?", name)) === 1,
    );
    return one("SELECT id, parentUserId FROM Client WHERE fullName = ?", name);
  };

  const tag = Date.now().toString().slice(-6);

  /* --- Shaxsiy ma'lumotni tozalash --- */
  const wipeName = `Tozalash Bola ${tag}`;
  const wiped = await makeClient(wipeName, `+99890555${tag.slice(-4)}`);
  check("Tozalash uchun mijoz yasaldi", Boolean(wiped?.id));

  await page.goto(`${BASE}/clients/${wiped.id}`);
  await page.waitForLoadState("networkidle");
  check("Mijoz kartasida 'Xavfli amallar' bor", (await page.locator("main").innerText()).includes("Xavfli amallar"));

  // Noto'g'ri ism bilan hech narsa bo'lmasligi kerak
  await page.fill("#confirmAnon", "boshqa ism");
  await page.locator('form:has(#confirmAnon) button[type="submit"]').click();
  await page.waitForTimeout(1500);
  check(
    "Noto'g'ri ism bilan tozalanmaydi",
    (await one("SELECT fullName FROM Client WHERE id = ?", wiped.id))?.fullName === wipeName,
  );

  await page.goto(`${BASE}/clients/${wiped.id}`);
  await page.waitForLoadState("networkidle");
  await page.fill("#confirmAnon", wipeName);
  await page.locator('form:has(#confirmAnon) button[type="submit"]').click();
  const cleaned = await waitUntil(async () => {
    const r = await one("SELECT fullName FROM Client WHERE id = ?", wiped.id);
    return r?.fullName === "O'chirilgan mijoz";
  });
  const after = await one(
    "SELECT fullName, parentPhone, diagnosis, status, parentUserId FROM Client WHERE id = ?",
    wiped.id,
  );
  check(
    "Shaxsiy ma'lumot tozalanadi",
    cleaned && after.parentPhone === "—" && !after.diagnosis && after.status === "ARCHIVED",
    JSON.stringify(after),
  );
  check(
    "Ota-ona akkaunti ham o'chadi",
    after.parentUserId === null &&
      (await count("SELECT COUNT(*) AS n FROM User WHERE id = ?", wiped.parentUserId)) === 0,
  );
  check(
    "Mijozning o'zi joyida qoladi",
    (await count("SELECT COUNT(*) AS n FROM Client WHERE id = ?", wiped.id)) === 1,
  );

  /* --- Butunlay o'chirish --- */
  const delName = `O'chirish Bola ${tag}`;
  const doomed = await makeClient(delName, `+99890666${tag.slice(-4)}`);

  // To'lov qo'shamiz: o'chirilganda u ham ketishi kerak
  await page.goto(`${BASE}/clients/${doomed.id}?ochiq=tolov#tolov`);
  await page.waitForLoadState("networkidle");
  await page.fill("#amount", "100000");
  await page.locator('form:has(#amount) button[type="submit"]').click();
  await waitUntil(
    async () => (await count("SELECT COUNT(*) AS n FROM Payment WHERE clientId = ?", doomed.id)) === 1,
  );

  await page.goto(`${BASE}/clients/${doomed.id}`);
  await page.waitForLoadState("networkidle");
  await page.fill("#confirmDel", delName);
  await page.locator('form:has(#confirmDel) button[type="submit"]').click();
  const gone = await waitUntil(
    async () => (await count("SELECT COUNT(*) AS n FROM Client WHERE id = ?", doomed.id)) === 0,
  );
  check("Mijoz butunlay o'chadi", gone);
  // O'chirish tugagach sahifa ro'yxatga qaytadi — baza yozuvi yo'qolishi bilan
  // brauzer darhol ko'chib ulgurmaydi, shuning uchun manzilni alohida kutamiz
  await page.waitForURL((u) => u.pathname === "/clients", { timeout: 15000 }).catch(() => {});
  check(
    "To'lovi ham o'chadi",
    (await count("SELECT COUNT(*) AS n FROM Payment WHERE clientId = ?", doomed.id)) === 0,
  );
  check(
    "Ota-ona akkaunti ham o'chadi (o'chirishda)",
    (await count("SELECT COUNT(*) AS n FROM User WHERE id = ?", doomed.parentUserId)) === 0,
  );
  check("O'chirgandan keyin ro'yxatga qaytaradi", page.url().endsWith("/clients"), page.url());
}

/* 9v. Noto'g'ri kiritilgan to'lovni tuzatish */
{
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const pay = await one(
    `SELECT p.id, p.amount, p.clientId, p.branchId FROM Payment p
      WHERE p.paidAt >= ? AND p.packageId IS NULL ORDER BY p.paidAt DESC LIMIT 1`,
    monthStart,
  );
  const other = pay
    ? await one(
        "SELECT id FROM Client WHERE branchId = ? AND id <> ? AND status = 'ACTIVE' ORDER BY fullName LIMIT 1",
        pay.branchId,
        pay.clientId,
      )
    : null;
  check("Tuzatish uchun shu oydagi to'lov bor", Boolean(pay && other));

  if (pay && other) {
    const editForm = () =>
      page.locator(`form[data-testid="payment-edit-form"]:has(input[name="paymentId"][value="${pay.id}"])`);
    await page.goto(`${BASE}/payments`);
    await page.waitForLoadState("networkidle");
    check(
      "To'lovlar jadvalida \"Yo'nalish\" o'rniga \"Abonement\" ustuni",
      !(await page.locator("thead").first().innerText()).includes("YO'NALISH"),
    );

    // Summani tuzatish
    await editForm().locator("xpath=ancestor::details[1]").locator("summary").click();
    await editForm().locator('input[name="amount"]').fill(String(pay.amount + 1000));
    await editForm().locator('button[type="submit"]').click();
    const amountFixed = await waitUntil(
      async () => (await one("SELECT amount FROM Payment WHERE id = ?", pay.id))?.amount === pay.amount + 1000,
    );
    check("To'lov summasini tuzatish mumkin", amountFixed);

    // Boshqa mijozga yozilib qolgan to'lovni to'g'ri mijozga o'tkazish
    const sumOf = async (id) =>
      Number((await one("SELECT COALESCE(SUM(amount), 0) AS n FROM Payment WHERE clientId = ?", id)).n);
    const [fromBefore, toBefore] = [await sumOf(pay.clientId), await sumOf(other.id)];
    await page.goto(`${BASE}/payments`);
    await page.waitForLoadState("networkidle");
    await editForm().locator("xpath=ancestor::details[1]").locator("summary").click();
    await editForm().locator('select[name="clientId"]').selectOption(other.id);
    await editForm().locator('button[type="submit"]').click();
    const moved = await waitUntil(async () => !(await one("SELECT id FROM Payment WHERE id = ?", pay.id)));
    const [fromAfter, toAfter] = [await sumOf(pay.clientId), await sumOf(other.id)];
    check(
      "To'lovni boshqa mijozga o'tkazish mumkin (summa to'liq ko'chadi)",
      moved && fromBefore - fromAfter === pay.amount + 1000 && toAfter - toBefore === pay.amount + 1000,
      `${fromBefore}->${fromAfter}, ${toBefore}->${toAfter}`,
    );
  }
}

/* 9v. Yakka mutaxassis: markaz bilan aralashmaydi */
{
  const tag = Date.now().toString().slice(-6);
  const CODE = `SINOV-${tag}`;
  const soloPhone = `+99890444${tag.slice(-4)}`;
  const soloName = `Yakka Mutaxassis ${tag}`;
  const soloClient = `Yakka Bola ${tag}`;

  // Kod sozlanmaguncha ro'yxatdan o'tish yopiq bo'lishi kerak.
  // Kirgan foydalanuvchi baribir bosh sahifaga ketadi, shuning uchun
  // sessiyasiz tekshiramiz.
  await all("UPDATE Settings SET soloInviteCode = NULL WHERE id = 'main'");
  await ctx.clearCookies();
  await page.goto(`${BASE}/royxat`);
  await page.waitForLoadState("networkidle");
  check("Kodsiz ro'yxatdan o'tish yopiq", page.url().includes("/login"), page.url());

  // Kodni ilovani sotayotgan odam terminaldan qo'yadi (npm run db:solo-code) —
  // markaz rahbarining panelida bunday sozlama bo'lmasligi kerak
  await all("UPDATE Settings SET soloInviteCode = ? WHERE id = 'main'", CODE);
  await login(owner.phone);
  await page.goto(`${BASE}/settings`);
  await page.waitForLoadState("networkidle");
  check(
    "Egada yakka mutaxassis sozlamasi yo'q",
    !(await page.locator("main").innerText()).includes("Yakka mutaxassis")
      && (await page.locator("#soloInviteCode").count()) === 0,
  );

  // Markazdagi mijozlar soni — keyin solishtiramiz
  // Har bir mijoz ikki qator chizadi (ikkinchisida tahrirlash formasi), shuning
  // uchun qatorni emas, mijoz havolasini sanaymiz
  const clientLinks = () => page.locator('tbody a[href^="/clients/"]').count();
  await page.goto(`${BASE}/clients`);
  await page.waitForSelector("tbody tr", { timeout: 15000 });
  const ownerClientsBefore = await clientLinks();
  const someCenterClient = (await one("SELECT fullName FROM Client ORDER BY fullName LIMIT 1")).fullName;

  /* --- Yakka mutaxassis ro'yxatdan o'tadi --- */
  await ctx.clearCookies();
  await page.goto(`${BASE}/royxat`);
  await page.waitForSelector("#inviteCode", { timeout: 15000 });

  // Noto'g'ri kod o'tmasligi kerak
  await page.fill("#inviteCode", "boshqa-kod");
  await page.fill("#fullName", soloName);
  await page.fill("#phone", soloPhone);
  await page.fill("#password", PASSWORD);
  await page.click('form button[type="submit"]');
  await page.waitForTimeout(1500);
  check(
    "Noto'g'ri kod bilan akkaunt ochilmaydi",
    (await count("SELECT COUNT(*) AS n FROM User WHERE phone = ?", soloPhone)) === 0,
  );

  await page.goto(`${BASE}/royxat`);
  await page.waitForSelector("#inviteCode", { timeout: 15000 });
  await page.fill("#inviteCode", CODE);
  await page.fill("#fullName", soloName);
  await page.fill("#phone", soloPhone);
  await page.fill("#password", PASSWORD);
  await page.fill("#price", "200000");
  await page.click('form button[type="submit"]');
  const registered = await waitUntil(
    async () => (await count("SELECT COUNT(*) AS n FROM User WHERE phone = ?", soloPhone)) === 1,
  );
  check("Yakka mutaxassis ro'yxatdan o'tadi", registered);

  const solo = await one(
    `SELECT u.id AS userId, u.branchId, b.isSolo, s.id AS specialistId, s.salaryPercent, s.defaultPrice
       FROM User u JOIN Branch b ON b.id = u.branchId
       JOIN Specialist s ON s.userId = u.id WHERE u.phone = ?`,
    soloPhone,
  );
  check(
    "O'ziga alohida filial ochiladi, puli 100%",
    solo?.isSolo === true && Number(solo.salaryPercent) === 100 && Number(solo.defaultPrice) === 200000,
    JSON.stringify(solo),
  );

  // Ro'yxatdan o'tgach darhol o'z rahbar paneliga tushadi — u o'ziga o'zi rahbar
  await page.waitForURL((u) => new URL(u).pathname === "/", { timeout: 15000 }).catch(() => {});
  check("Ro'yxatdan keyin panelga tushadi", new URL(page.url()).pathname === "/", page.url());

  /* --- Panel: egadagidek, faqat Xodimlar va Filiallarsiz --- */
  await page.waitForLoadState("networkidle");
  const soloNav = await page.locator("aside").innerText();
  check(
    "Yakka menyusida Panel, Qabullar, Hisobotlar bor",
    ["Panel", "Qabullar", "To'lovlar", "Hisobotlar", "Sozlamalar"].every((x) => soloNav.includes(x)),
    soloNav.replace(/\n/g, " | "),
  );
  check(
    "Yakka menyusida Xodimlar va Filiallar yo'q",
    !soloNav.includes("Xodimlar") && !soloNav.includes("Filiallar") && !soloNav.includes("Pulim"),
  );
  const soloPanel = await page.locator("main").innerText();
  check(
    "Yakka panelida mutaxassis haqi va markaz ulushi yo'q",
    !soloPanel.includes("Markaz ulushi") && !soloPanel.includes("Mutaxassis haqi"),
  );

  for (const path of ["/specialists", "/branches"]) {
    await page.goto(`${BASE}${path}`);
    await page.waitForLoadState("networkidle");
    check(`Yakka ${path} ga kira olmaydi`, !page.url().includes(path), page.url());
  }

  await page.goto(`${BASE}/reports`);
  await page.waitForLoadState("networkidle");
  check(
    "Yakka hisobotlarni ko'radi",
    page.url().includes("/reports") && !(await page.locator("main").innerText()).includes("Markaz ulushi"),
    page.url(),
  );

  // Seans narxini Sozlamalardan o'zi o'zgartiradi
  await page.goto(`${BASE}/settings`);
  await page.waitForSelector("#soloPrice", { timeout: 15000 });
  check("Yakka ham kanalga e'lon qila oladi", (await page.locator("#channel").count()) === 1);
  await page.fill("#soloPrice", "210000");
  await page.locator("form:has(#soloPrice) button[type=submit]").click();
  check(
    "Yakka seans narxini o'zgartira oladi",
    await waitUntil(
      async () => Number((await one("SELECT defaultPrice FROM Specialist WHERE id = ?", solo.specialistId)).defaultPrice) === 210000,
    ),
  );

  // Qabulda "kim ko'radi" so'ralmaydi — doim o'zi
  const soloIntake = `Yakka Qabul ${tag}`;
  await page.goto(`${BASE}/intakes`);
  await page.waitForLoadState("networkidle");
  await page.click('summary:has-text("Yangi qabul")');
  check(
    "Yakka qabulida filial va mutaxassis tanlovi yo'q",
    (await page.locator("#branchId").count()) === 0 && (await page.locator("#specialistId").count()) === 0,
  );
  await page.fill("#childName", soloIntake);
  await page.fill("#birthDate", "2020-02-02");
  await page.fill("#parentName", "Yakka Ona");
  await page.fill("#parentPhone", `+99890222${tag.slice(-4)}`);
  await page.locator('form button:has-text("Saqlash")').first().click();
  check(
    "Yakka qabuli o'ziga va o'z filialiga yoziladi",
    await waitUntil(
      async () => (await count(
        "SELECT COUNT(*) AS n FROM Intake WHERE childName = ? AND specialistId = ? AND branchId = ?",
        soloIntake, solo.specialistId, solo.branchId,
      )) === 1,
    ),
  );

  /* --- O'zi mijoz qo'shadi va to'lov yozadi --- */
  await page.goto(`${BASE}/clients`);
  await page.waitForLoadState("networkidle");
  await page.click('summary:has-text("Yangi mijoz")');
  await page.fill("#fullName", soloClient);
  await page.fill("#birthDate", "2019-06-06");
  await page.fill("#parentName", "Yakka Ota");
  await page.fill("#parentPhone", `+99890333${tag.slice(-4)}`);
  await page.click('form button:has-text("Saqlash")');
  const added = await waitUntil(
    async () => (await count("SELECT COUNT(*) AS n FROM Client WHERE fullName = ?", soloClient)) === 1,
  );
  check("Yakka mutaxassis o'zi mijoz qo'sha oladi", added);

  const kid = await one("SELECT id, branchId FROM Client WHERE fullName = ?", soloClient);
  check("Mijoz uning filialiga tushadi", kid?.branchId === solo.branchId);
  check(
    "Mijoz o'ziga biriktiriladi",
    (await count(
      "SELECT COUNT(*) AS n FROM Assignment WHERE clientId = ? AND specialistId = ?",
      kid.id, solo.specialistId,
    )) === 1,
  );

  // O'z mijozini ro'yxatda ko'radi
  await page.goto(`${BASE}/clients`);
  await page.waitForSelector("tbody tr", { timeout: 15000 });
  const soloSees = await page.locator("main").innerText();
  check("O'z mijozini ko'radi", soloSees.includes(soloClient));
  check(
    "Markazning mijozlarini ko'rmaydi",
    (await clientLinks()) === 1 && !soloSees.includes(someCenterClient),
    `${await clientLinks()} ta mijoz`,
  );

  // To'lov yoza oladi
  await page.goto(`${BASE}/payments`);
  await page.waitForLoadState("networkidle");
  check("To'lovlar sahifasi ochiladi", !page.url().includes("/login") && page.url().includes("/payments"), page.url());

  /* --- Eng muhimi: ega yakka mutaxassisni ko'rmaydi --- */
  await login(owner.phone);
  await page.goto(`${BASE}/clients`);
  await page.waitForSelector("tbody tr", { timeout: 15000 });
  const ownerSees = await page.locator("main").innerText();
  check("Ega yakka mijozni ko'rmaydi", !ownerSees.includes(soloClient));
  check(
    "Egada mijozlar soni o'zgarmagan",
    (await clientLinks()) === ownerClientsBefore,
    `${await clientLinks()} / ${ownerClientsBefore}`,
  );

  await page.goto(`${BASE}/specialists`);
  await page.waitForLoadState("networkidle");
  check(
    "Ega yakka mutaxassisni xodimlar ro'yxatida ko'rmaydi",
    !(await page.locator("main").innerText()).includes(soloName),
  );

  await page.goto(`${BASE}/branches`);
  await page.waitForLoadState("networkidle");
  check(
    "Ega yakka filialni ko'rmaydi",
    !(await page.locator("main").innerText()).includes("(yakka)"),
  );

  // Tozalab qo'yamiz: keyingi tekshiruvlarga xalaqit bermasin
  await all("DELETE FROM Intake WHERE branchId = ?", solo.branchId);
  await all("DELETE FROM Client WHERE id = ?", kid.id);
  await all("DELETE FROM User WHERE id = ?", solo.userId);
  await all("DELETE FROM Branch WHERE id = ?", solo.branchId);
  await all("UPDATE Settings SET soloInviteCode = NULL WHERE id = 'main'");
}

/* 9h. Bosh panelda filiallar kesimi */
{
  await page.goto(`${BASE}/`);
  await page.waitForLoadState("networkidle");
  const panel = (await page.locator("main").innerText()).replace(/\u00a0/g, " ");
  const branchNames = await all("SELECT name FROM Branch ORDER BY name");
  check(
    "Panelda filiallar bo'yicha hisobot bor",
    panel.includes("Filiallar bo'yicha") && branchNames.every((b) => panel.includes(b.name)),
    branchNames.map((b) => b.name).join(", "),
  );
  check("Hisobotda jami qatori bor", panel.includes("Jami"));
}

/* 9i. Qabullar: yozish -> konsultatsiya puli -> mijozga o'tkazish */
{
  await page.goto(`${BASE}/intakes`);
  await page.waitForLoadState("networkidle");
  const seeded = await count("SELECT COUNT(*) AS n FROM Intake");
  check("Qabullar sahifasi ochiladi", (await page.content()).includes("Qabullar"), page.url());
  check("Seed'da qabullar bor", seeded > 0, `${seeded} ta`);

  // Yangi qabul
  const child = `Sinov Qabulov ${String(Date.now()).slice(-5)}`;
  const parentPhone = `+99893${String(Date.now()).slice(-7)}`;
  await page.click('summary:has-text("Yangi qabul")');
  await page.fill("#childName", child);
  await page.fill("#birthDate", "2021-05-10");
  await page.fill("#parentName", "Sinov Ota-onayev");
  await page.fill("#parentPhone", parentPhone);
  await page.fill("#price", "150000");

  // Filial oldindan tanlanmaydi; tanlangach "Kim ko'radi" faqat o'sha filial
  // mutaxassislarini ko'rsatadi
  const intakeBranch = await one(
    "SELECT b.id FROM Branch b JOIN Specialist s ON s.branchId = b.id WHERE s.isActive = true GROUP BY b.id ORDER BY b.id LIMIT 1",
  );
  check(
    "Qabulda filial tanlanmaguncha mutaxassis tanlab bo'lmaydi",
    (await page.locator("#branchId").evaluate((el) => el.value)) === "" &&
      (await page.locator("#specialistId").isDisabled()),
  );
  await page.selectOption("#branchId", intakeBranch.id);
  const offered = await page.locator("#specialistId option:not([value=''])").evaluateAll((els) => els.map((e) => e.value));
  const ofBranch = (await all("SELECT id FROM Specialist WHERE branchId = ? AND isActive = true", intakeBranch.id)).map((r) => r.id);
  check(
    "Qabulda faqat tanlangan filial mutaxassislari chiqadi",
    offered.length > 0 && offered.length === ofBranch.length && offered.every((id) => ofBranch.includes(id)),
    `${offered.length} / ${ofBranch.length}`,
  );
  await page.locator('form button:has-text("Saqlash")').first().click();

  const created = await waitUntil(
    async () => (await count(`SELECT COUNT(*) AS n FROM Intake WHERE childName = '${child}'`)) === 1,
  );
  check("Yangi qabul yoziladi", created, child);

  const row = page.locator(`tr:has-text("${child}")`).first();
  await page.waitForLoadState("networkidle");

  // Hali o'tmagan qabulda "Mijozga o'tkazish" bo'lmaydi — nega ekani yozilsin
  check(
    "Rejadagi qabulda o'tkazish shartini aytadi",
    (await row.innerText()).includes("avval"),
  );

  // Konsultatsiya o'tdi
  await row.locator('button:has-text("o\'tdi")').first().click();
  const held = await waitUntil(
    async () => (await one(`SELECT status FROM Intake WHERE childName = '${child}'`)).status === "DONE",
  );
  check("Qabul 'bo'lib o'tdi' deb belgilanadi", held);

  // Konsultatsiya puli
  await page.waitForLoadState("networkidle");
  const payRow = page.locator(`tr:has-text("${child}")`).first();
  await payRow.locator('input[name="price"]').fill("170000");
  await payRow.locator('button:has-text("to\'landi")').click();
  const paid = await waitUntil(async () => {
    const r = await one(`SELECT price, paidAt FROM Intake WHERE childName = '${child}'`);
    return r.price === 170000 && r.paidAt !== null;
  });
  check("Konsultatsiya puli qabul qilinadi", paid, "170 000");

  // Mijozga o'tkazish
  await page.waitForLoadState("networkidle");
  const clientsBefore = await count("SELECT COUNT(*) AS n FROM Client");
  const convRow = page.locator(`tr:has-text("${child}")`).first();
  await convRow.locator('button:has-text("Mijozga o\'tkazish")').click();
  const converted = await waitUntil(async () => {
    const r = await one(`SELECT clientId, result FROM Intake WHERE childName = '${child}'`);
    return r.clientId !== null && r.result === "CONVERTED";
  });
  check("Qabul mijozga o'tkaziladi", converted);
  check(
    "Mijozlar ro'yxatiga qo'shiladi",
    (await count("SELECT COUNT(*) AS n FROM Client")) === clientsBefore + 1,
  );
  const madeClient = await one(
    `SELECT c.fullName, c.parentPhone FROM Client c
       JOIN Intake i ON i.clientId = c.id WHERE i.childName = '${child}'`,
  );
  check(
    "Mijoz ma'lumoti qabuldan ko'chiriladi",
    madeClient.fullName === child && madeClient.parentPhone === parentPhone,
    `${madeClient.fullName} · ${madeClient.parentPhone}`,
  );

  // Konsultatsiya puli hisobotda va to'lovlarda ko'rinadi
  await page.goto(`${BASE}/reports`);
  await page.waitForLoadState("networkidle");
  check(
    "Hisobotda konsultatsiya puli bor",
    (await page.locator("main").innerText()).includes("Konsultatsiyalardan"),
    page.url(),
  );

  await page.goto(`${BASE}/payments`);
  await page.waitForLoadState("networkidle");
  const payText = (await page.locator("main").innerText()).replace(/\u00a0/g, " ");
  check(
    "To'lovlar sahifasida konsultatsiyalar ko'rinadi",
    payText.includes("Konsultatsiyalar") && payText.includes(child),
    page.url(),
  );
  check(
    "Konsultatsiya puli jami tushumga qo'shiladi",
    payText.includes("konsultatsiyadan"),
  );
}

/* 9j. Qabulni tahrirlash: vaqti va kim ko'rishi keyin aniq bo'ladi */
{
  const target = await one(
    "SELECT id, childName, branchId FROM Intake WHERE status = 'PLANNED' ORDER BY scheduledAt DESC LIMIT 1",
  );
  const specialist = target
    ? await one(`SELECT id FROM Specialist WHERE branchId = '${target.branchId}' LIMIT 1`)
    : null;

  if (!target) {
    check("Tahrirlash uchun rejadagi qabul bor", false, "topilmadi");
  } else {
    await page.goto(`${BASE}/intakes`);
    await page.waitForLoadState("networkidle");

    // Tahrirlash qatori — ichida "tahrirlash" ochilmasi bor qator
    const editRow = page
      .locator(`tr:has(input[name="intakeId"][value="${target.id}"])`)
      .filter({ has: page.locator("summary") });
    await editRow.locator("summary").click();

    const form = editRow.locator("form");
    // Sana shu oy ichida qolsin: aks holda qator ro'yxatdan chiqib ketadi va
    // testni qayta ishga tushirganda topilmay qoladi.
    const pad = (n) => String(n).padStart(2, "0");
    const now = new Date();
    const day = now.getDate() > 15 ? 5 : 25;
    const wanted = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(day)}T09:30`;

    await form.locator('input[name="scheduledAt"]').fill(wanted);
    if (specialist) await form.locator('select[name="specialistId"]').selectOption(specialist.id);
    await form.locator('button:has-text("Saqlash")').click();

    const saved = await waitUntil(async () => {
      const r = await one(`SELECT specialistId, scheduledAt FROM Intake WHERE id = '${target.id}'`);
      const when = new Date(r.scheduledAt);
      return (
        when.getFullYear() === now.getFullYear() &&
        when.getMonth() === now.getMonth() &&
        when.getDate() === day &&
        (!specialist || r.specialistId === specialist.id)
      );
    });
    check("Qabulning vaqti va mutaxassisi tahrirlanadi", saved, target.childName);

    // Saqlangani ko'rinib turishi kerak: forma yopiladi, qator joyiga qaytadi
    const note = page.getByRole("alert").filter({ hasText: "Saqlandi" });
    check(
      "Saqlangani haqida xabar chiqadi",
      await note
        .waitFor({ state: "visible", timeout: 8000 })
        .then(() => true)
        .catch(() => false),
    );
  }
}

/* 9k. Filiallar: qo'shish, tahrirlash, bo'sh bo'lmaganini o'chirmaslik */
{
  const before = await count("SELECT COUNT(*) AS n FROM Branch");
  const name = `Sinov filiali ${String(Date.now()).slice(-5)}`;

  await page.goto(`${BASE}/branches`);
  await page.waitForLoadState("networkidle");
  check("Filiallar sahifasi ochiladi", (await page.locator("main").innerText()).includes("Filiallar"));

  await page.click('summary:has-text("Yangi filial")');
  await page.fill("#name", name);
  await page.fill("#address", "Toshkent, Sinov ko'chasi 1");
  await page.locator('form button:has-text("Qo\'shish")').first().click();

  const added = await waitUntil(
    async () => (await count("SELECT COUNT(*) AS n FROM Branch")) === before + 1,
  );
  check("Yangi filial qo'shiladi", added, name);

  // Nomini o'zgartirish
  await page.waitForLoadState("networkidle");
  const row = page.locator(`tr:has-text("${name}")`).first();
  await row.locator("summary").click();
  await row.locator('input[name="name"]').fill(`${name} (yangi)`);
  await row.locator('button:has-text("Saqlash")').click();
  const renamed = await waitUntil(
    async () =>
      (await count(`SELECT COUNT(*) AS n FROM Branch WHERE name = '${name} (yangi)'`)) === 1,
  );
  check("Filial nomi tahrirlanadi", renamed);

  // Bo'sh filialni o'chirish mumkin
  await page.waitForLoadState("networkidle");
  const freshRow = page.locator(`tr:has-text("${name} (yangi)")`).first();
  await freshRow.locator('button:has-text("o\'chirish")').click();
  const removed = await waitUntil(
    async () => (await count("SELECT COUNT(*) AS n FROM Branch")) === before,
  );
  check("Bo'sh filial o'chiriladi", removed);

  // Mijozi bor filialni o'chirib bo'lmaydi
  await page.goto(`${BASE}/branches`);
  await page.waitForLoadState("networkidle");
  const busy = await one(
    "SELECT b.name FROM Branch b JOIN Client c ON c.branchId = b.id GROUP BY b.name LIMIT 1",
  );
  const busyRow = page.locator(`tr:has-text("${busy.name}")`).first();
  await busyRow.locator('button:has-text("o\'chirish")').click();
  const warned = page.getByRole("alert").filter({ hasText: "bo'sh emas" });
  check(
    "Mijozi bor filial o'chirilmaydi",
    (await warned
      .waitFor({ state: "visible", timeout: 8000 })
      .then(() => true)
      .catch(() => false)) && (await count("SELECT COUNT(*) AS n FROM Branch")) === before,
    busy.name,
  );
}

/* 9l. Xodim ma'lumotini tahrirlash */
{
  const target = await one(
    `SELECT s.id, s.specialization, s.salaryPercent, u.fullName, u.phone
       FROM Specialist s JOIN User u ON u.id = s.userId
      WHERE s.isActive = true LIMIT 1`,
  );
  const newPhone = `+99894${String(Date.now()).slice(-7)}`;

  await page.goto(`${BASE}/specialists`);
  await page.waitForLoadState("networkidle");

  const editRow = page
    .locator(`tr:has(input[name="specialistId"][value="${target.id}"])`)
    .filter({ has: page.locator("summary") });
  await editRow.locator("summary").click();
  const form = editRow.locator("form");

  await form.locator('input[name="fullName"]').fill(`${target.fullName} (tahrir)`);
  await form.locator('input[name="phone"]').fill(newPhone);
  await form.locator('select[name="specialization"]').selectOption("LOGOPED");
  await form.locator('input[name="salaryPercent"]').fill("55");
  await form.locator('button:has-text("Saqlash")').click();

  const saved = await waitUntil(async () => {
    const r = await one(
      `SELECT u.fullName, u.phone, s.specialization, s.salaryPercent
         FROM Specialist s JOIN User u ON u.id = s.userId WHERE s.id = '${target.id}'`,
    );
    return (
      r.fullName === `${target.fullName} (tahrir)` &&
      r.phone === newPhone &&
      r.specialization === "LOGOPED" &&
      r.salaryPercent === 55
    );
  });
  check("Mutaxassis ma'lumoti tahrirlanadi", saved, newPhone);

  // Parolni bo'sh qoldirsa eskisi qolishi kerak — yangi raqam bilan kiramiz
  await login(newPhone);
  check("Parol bo'sh qoldirilsa o'zgarmaydi", page.url().endsWith("/m"), page.url());
  await login(owner.phone);

  // Band raqamni berib bo'lmaydi
  await page.goto(`${BASE}/specialists`);
  await page.waitForLoadState("networkidle");
  const again = page
    .locator(`tr:has(input[name="specialistId"][value="${target.id}"])`)
    .filter({ has: page.locator("summary") });
  await again.locator("summary").click();
  await again.locator('input[name="phone"]').fill(owner.phone);
  await again.locator('button:has-text("Saqlash")').click();
  const warned = page.getByRole("alert").filter({ hasText: "allaqachon" });
  check(
    "Band telefon raqam qabul qilinmaydi",
    await warned
      .waitFor({ state: "visible", timeout: 8000 })
      .then(() => true)
      .catch(() => false),
  );

  // Eski holatiga qaytaramiz: keyingi tekshiruvlar shu mutaxassis bilan
  // kirishadi, raqami o'zgargancha qolsa ular yiqiladi.
  await page.goto(`${BASE}/specialists`);
  await page.waitForLoadState("networkidle");
  const back = page
    .locator(`tr:has(input[name="specialistId"][value="${target.id}"])`)
    .filter({ has: page.locator("summary") });
  await back.locator("summary").click();
  await back.locator('input[name="fullName"]').fill(target.fullName);
  await back.locator('input[name="phone"]').fill(target.phone);
  await back.locator('select[name="specialization"]').selectOption(target.specialization);
  await back.locator('input[name="salaryPercent"]').fill(String(target.salaryPercent));
  await back.locator('button:has-text("Saqlash")').click();
  const restored = await waitUntil(async () => {
    const r = await one(
      `SELECT u.phone FROM Specialist s JOIN User u ON u.id = s.userId WHERE s.id = '${target.id}'`,
    );
    return r.phone === target.phone;
  });
  check("Xodim ma'lumoti eski holiga qaytariladi", restored, target.phone);
}

/* 9m. Mijoz kartasini tahrirlash */
{
  const target = await one(
    "SELECT id, fullName, parentName, parentPhone FROM Client ORDER BY fullName LIMIT 1",
  );
  const newPhone = `+99895${String(Date.now()).slice(-7)}`;

  await page.goto(`${BASE}/clients/${target.id}`);
  await page.waitForLoadState("networkidle");

  const form = page.locator('form:has(input[name="parentPhone"])').first();
  await form.locator('input[name="fullName"]').fill(`${target.fullName} (tahrir)`);
  await form.locator('input[name="diagnosis"]').fill("Sinov tashxisi");
  await form.locator('input[name="parentPhone"]').fill(newPhone);
  await form.locator('button:has-text("Saqlash")').click();

  const saved = await waitUntil(async () => {
    const r = await one(
      `SELECT fullName, diagnosis, parentPhone FROM Client WHERE id = '${target.id}'`,
    );
    return (
      r.fullName === `${target.fullName} (tahrir)` &&
      r.diagnosis === "Sinov tashxisi" &&
      r.parentPhone === newPhone
    );
  });
  check("Mijoz ma'lumoti tahrirlanadi", saved, newPhone);

  // Yangi raqamga ota-ona akkaunti ochilib, mijoz o'shanga bog'lanadi
  const linked = await one(
    `SELECT u.phone FROM Client c JOIN User u ON u.id = c.parentUserId WHERE c.id = '${target.id}'`,
  );
  check("Ota-ona akkaunti yangi raqamga ulanadi", linked?.phone === newPhone, linked?.phone);

  // Eski holiga qaytaramiz — keyingi tekshiruvlar shu mijoz bilan ishlaydi
  await page.goto(`${BASE}/clients/${target.id}`);
  await page.waitForLoadState("networkidle");
  const back = page.locator('form:has(input[name="parentPhone"])').first();
  await back.locator('input[name="fullName"]').fill(target.fullName);
  await back.locator('input[name="diagnosis"]').fill("");
  await back.locator('input[name="parentPhone"]').fill(target.parentPhone);
  await back.locator('button:has-text("Saqlash")').click();
  const restored = await waitUntil(async () => {
    const r = await one(`SELECT parentPhone FROM Client WHERE id = '${target.id}'`);
    return r.parentPhone === target.parentPhone;
  });
  check("Mijoz eski holiga qaytariladi", restored);
}

/* 9n. Markaz sozlamalari va o'z parolini o'zgartirish */
{
  await page.goto(`${BASE}/settings`);
  await page.waitForLoadState("networkidle");
  check("Sozlamalar sahifasi ochiladi", (await page.locator("main").innerText()).includes("Ish vaqti"));

  // Ish vaqti
  const hours = page.locator('form:has(input[name="workStartHour"])');
  await hours.locator('input[name="workStartHour"]').fill("8");
  await hours.locator('input[name="workEndHour"]').fill("20");
  await hours.locator('input[name="slotMinutes"]').fill("45");
  await hours.locator('button:has-text("Saqlash")').click();
  const hoursSaved = await waitUntil(async () => {
    const r = await one("SELECT workStartHour, workEndHour, slotMinutes FROM Settings WHERE id='main'");
    return r && r.workStartHour === 8 && r.workEndHour === 20 && r.slotMinutes === 45;
  });
  check("Ish vaqti saqlanadi", hoursSaved);

  // Noto'g'ri qiymat rad etiladi.
  // Sahifani qaytadan ochamiz: saqlashdan keyin forma qayta chiziladi va
  // eski nusxasiga yozsak, tugma bosilmay qolishi mumkin.
  await page.goto(`${BASE}/settings`);
  await page.waitForLoadState("networkidle");
  const again = page.locator('form:has(input[name="workStartHour"])');
  await again.locator('input[name="workEndHour"]').fill("7");
  await again.locator('button:has-text("Saqlash")').click();
  const badHours = page.getByRole("alert").filter({ hasText: "keyin bo'lishi" });
  check(
    "Tugash vaqti boshlanishdan oldin bo'lsa rad etiladi",
    await badHours.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false),
  );

  // Narx va ulush
  await page.goto(`${BASE}/settings`);
  await page.waitForLoadState("networkidle");
  const pricing = page.locator('form:has(input[name="defaultPrice"])');
  await pricing.locator('input[name="defaultPrice"]').fill("175000");
  await pricing.locator('input[name="defaultSalaryPercent"]').fill("45");
  await pricing.locator('button:has-text("Saqlash")').click();
  const priced = await waitUntil(async () => {
    const r = await one("SELECT defaultPrice, defaultSalaryPercent FROM Settings WHERE id='main'");
    return r && r.defaultPrice === 175000 && r.defaultSalaryPercent === 45;
  });
  check("Standart narx va ulush saqlanadi", priced);

  // Standart qiymat formalarda ishlatiladi
  await page.goto(`${BASE}/specialists`);
  await page.waitForLoadState("networkidle");
  await page.click('summary:has-text("Yangi mutaxassis")');
  check(
    "Yangi mutaxassis formasida standart foiz turadi",
    (await page.locator("#salaryPercent").inputValue()) === "45",
  );

  // Parolni o'zgartirish: joriy parol noto'g'ri bo'lsa rad etiladi
  await page.goto(`${BASE}/settings`);
  await page.waitForLoadState("networkidle");
  const pw = page.locator('form:has(input[name="currentPassword"])');
  await pw.locator('input[name="currentPassword"]').fill("notogri");
  await pw.locator('input[name="newPassword"]').fill("yangiparol1");
  await pw.locator('input[name="repeatPassword"]').fill("yangiparol1");
  await pw.locator('button:has-text("Parolni o\'zgartirish")').click();
  const wrongPw = page.getByRole("alert").filter({ hasText: "Joriy parol" });
  check(
    "Joriy parol noto'g'ri bo'lsa parol o'zgarmaydi",
    await wrongPw.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false),
  );

  // To'g'ri parol bilan o'zgaradi, keyin qaytaramiz
  await page.goto(`${BASE}/settings`);
  await page.waitForLoadState("networkidle");
  const pw2 = page.locator('form:has(input[name="currentPassword"])');
  await pw2.locator('input[name="currentPassword"]').fill(PASSWORD);
  await pw2.locator('input[name="newPassword"]').fill("YangiParol9");
  await pw2.locator('input[name="repeatPassword"]').fill("YangiParol9");
  await pw2.locator('button:has-text("Parolni o\'zgartirish")').click();
  await waitUntil(async () => {
    const note = await page.getByRole("alert").filter({ hasText: "Parol o'zgartirildi" }).count();
    return note > 0;
  });

  await login(owner.phone, "YangiParol9");
  check("Yangi parol bilan kiriladi", !page.url().includes("/login"), page.url());

  await page.goto(`${BASE}/settings`);
  await page.waitForLoadState("networkidle");
  const pw3 = page.locator('form:has(input[name="currentPassword"])');
  await pw3.locator('input[name="currentPassword"]').fill("YangiParol9");
  await pw3.locator('input[name="newPassword"]').fill(PASSWORD);
  await pw3.locator('input[name="repeatPassword"]').fill(PASSWORD);
  await pw3.locator('button:has-text("Parolni o\'zgartirish")').click();
  await page.waitForLoadState("networkidle");
  await login(owner.phone);
  check("Parol eski holiga qaytariladi", !page.url().includes("/login"), page.url());
}

/* 9o. Bo'sh vaqtlar */
{
  await page.goto(`${BASE}/slots`);
  await page.waitForLoadState("networkidle");
  const text = await page.locator("main").innerText();
  check("Bo'sh vaqtlar sahifasi ochiladi", text.includes("Bo'sh vaqtlar"), page.url());

  const cells = await page.locator('tbody a[href*="sp="]').count();
  check("Haftalik jadvalda bo'sh vaqtlar soni ko'rinadi", cells > 0, `${cells} ta katak`);

  // Katakni bosib vaqtlarni ochamiz va seans yozamiz
  const before = await count("SELECT COUNT(*) AS n FROM Session");
  await page.locator('tbody a[href*="sp="]').first().click();
  // Katak bosilganda sahifa qayta chiziladi — forma paydo bo'lishini kutamiz
  // (networkidle bu yerda yetarli emas, RSC javobi keyinroq chiziladi).
  const slotForm = page.locator('form:has(select[name="clientId"])').first();
  const hasSlots = await slotForm
    .waitFor({ state: "visible", timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  check("Tanlangan kunning bo'sh vaqtlari chiqadi", hasSlots, page.url());

  if (hasSlots) {
    await slotForm.locator('select[name="clientId"]').selectOption({ index: 1 });
    await slotForm.locator('button:has-text("Yozish")').click();
    const booked = await waitUntil(
      async () => (await count("SELECT COUNT(*) AS n FROM Session")) === before + 1,
    );
    check("Bo'sh vaqtdan seans yoziladi", booked);
  }
}

/* 9p. Avtomatik zaxira (Telegram orqali) */
{
  // Maxfiy so'zsiz hech kim zaxira so'rab ololmasligi kerak
  const noSecret = await fetch(`${BASE}/api/backup`);
  check("Zaxira manzili maxfiy so'zsiz ochilmaydi", noSecret.status === 403, `status ${noSecret.status}`);

  const wrong = await fetch(`${BASE}/api/backup?secret=notogri`);
  check("Noto'g'ri maxfiy so'z rad etiladi", wrong.status === 403, `status ${wrong.status}`);

  // To'g'ri so'z bilan: sinov muhitida Telegram'ga chiqish yopiq, shuning uchun
  // yuborilmaydi — lekin javob tushunarli bo'lishi kerak
  const ok = await fetch(`${BASE}/api/backup?secret=lokal-cron-siri`);
  const body = await ok.json().catch(() => ({}));
  check(
    "To'g'ri maxfiy so'z bilan zaxira ishga tushadi",
    typeof body.owners === "number" || typeof body.error === "string",
    JSON.stringify(body).slice(0, 120),
  );

  await page.goto(`${BASE}/settings`);
  await page.waitForLoadState("networkidle");
  check(
    "Sozlamalarda zaxira bo'limi bor",
    (await page.locator("main").innerText()).includes("Zaxira nusxa"),
  );
}

/* 10. Mutaxassis roli chegaralangan */
await login(specialist.phone);
check(
  "Mutaxassis telefon kabinetiga tushadi",
  page.url().endsWith("/m") && (await page.content()).includes("Qolgan pulim"),
  page.url(),
);

// Mutaxassis ilovani o'rnatish yo'lini kabinetning o'zidan topishi kerak
check(
  "Kabinetda o'rnatish taklifi bor",
  (await page.locator('a[href="/install"], button:has-text("rnatish")').count()) > 0,
  page.url(),
);

// To'liq ko'rinishda ham menyu rolga mos bo'lishi kerak
await page.goto(`${BASE}/schedule`);
await page.waitForLoadState("networkidle");
const navText = await page.locator("aside").innerText();
check(
  "Mutaxassisga to'lov/hisobot menyusi berkitilgan",
  !navText.includes("Hisobotlar") && !navText.includes("To'lovlar"),
  navText.replace(/\n/g, " | "),
);
await denied("Mutaxassis /payments ga kira olmaydi", "/payments", "Qarzdorlar");
await denied("Mutaxassis /intakes ga kira olmaydi", "/intakes", "Yangi qabul");

await page.goto(`${BASE}/earnings`);
await page.waitForLoadState("networkidle");
const earningsBody = await page.content();
check(
  "Mutaxassis 'Pulim' sahifasini ko'radi",
  earningsBody.includes("Qolgan (olishim kerak)") && earningsBody.includes("Jami hisoblangan"),
  page.url(),
);

/* 10a. Telegram kanalga e'lon: ega ko'radi, xato sababi aytiladi */
{
  await login(owner.phone);
  await page.goto(`${BASE}/settings`);
  await page.waitForSelector("#channel", { timeout: 15000 });
  const text = await page.inputValue("#channelText");
  check(
    "Egada kanalga e'lon bo'limi bor, matn tayyor",
    text.includes("Kabinet") && (await page.inputValue("#buttonText")).length > 0,
  );
  // Testdagi token soxta — Telegram rad etadi. Muhimi: jim qolmasin,
  // qizil xabarda sababi ko'rinsin va "joylandi" deb aldamasin
  await page.fill("#channel", "https://t.me/sinov_kanal_yoq");
  await page.locator("form:has(#channel) button[type=submit]").click();
  const shown = await waitUntil(async () => /Telegram|Kanal|Bot/.test(await page.locator("body").innerText()) &&
    (await page.locator("body").innerText()).match(/(bot topilmadi|Kanal topilmadi|admin emas|qabul qilmadi|sozlanmagan)/i) !== null, 12000);
  const body = await page.locator("body").innerText();
  check("Kanalga joylanmasa sababi ko'rinadi", shown && !body.includes("E'lon kanalga joylandi"), body.match(/.*(topilmadi|admin emas|qabul qilmadi|sozlanmagan).*/i)?.[0] ?? "");
}

/* 10b. Qabulxona xodimi: faqat jadval, mijozlar va to'lovlar */
if (!reception) {
  check("Qabulxona xodimi mavjud", false, "seed'da yo'q");
} else {
  await login(reception.phone);
  check(
    "Qabulxona xodimi jadvalga tushadi",
    page.url().includes("/schedule"),
    page.url(),
  );

  const recNav = await page.locator("aside").innerText();
  check(
    "Qabulxonaga faqat o'z ishi ko'rinadi",
    recNav.includes("Jadval") &&
      recNav.includes("Qabullar") &&
      recNav.includes("Mijozlar") &&
      recNav.includes("To'lovlar") &&
      !recNav.includes("Hisobotlar") &&
      !recNav.includes("Xodimlar") &&
      !recNav.includes("Filiallar") &&
      !recNav.includes("Panel"),
    recNav.replace(/\n/g, " | "),
  );

  await page.goto(`${BASE}/settings`);
  await page.waitForLoadState("networkidle");
  check("Qabulxonada kanalga e'lon bo'limi yo'q", (await page.locator("#channel").count()) === 0);

  await page.goto(`${BASE}/reports`);
  await denied("Qabulxona hisobotlarni ko'ra olmaydi", "/reports", "Filiallar kesimi");

  await page.goto(`${BASE}/specialists`);
  await denied("Qabulxona xodimlar bo'limiga kira olmaydi", "/specialists", "Yangi mutaxassis");
  await denied("Qabulxona filiallarni boshqara olmaydi", "/branches", "Yangi filial");

  // To'lov qabul qila oladimi
  const recPayBefore = await count("SELECT COUNT(*) AS n FROM Payment");
  await page.goto(`${BASE}/payments`);
  await page.waitForLoadState("networkidle");
  check("Qabulxona to'lovlar sahifasini ko'radi", (await page.content()).includes("Jami tushum"));

  await page.click('summary:has-text("To\'lov qabul qilish")');
  check(
    "To'lov formasida mijoz oldindan tanlanmagan",
    (await page.locator("#clientId").evaluate((el) => el.value)) === "",
  );
  await page.locator("#clientId").selectOption({ index: 1 });
  await page.fill("#amount", "150000");
  await page.click('form button:has-text("Qabul qilish")');
  const recPaid = await waitUntil(
    async () => await count("SELECT COUNT(*) AS n FROM Payment") > recPayBefore,
  );
  check("Qabulxona to'lov qabul qila oladi", recPaid);

  // Mijoz kartasida to'lovni o'chirish tugmasi ko'rinmasligi kerak.
  // Abonement bo'limi faqat abonementchi mijozda bo'ladi — o'shani ochamiz.
  await page.goto(`${BASE}/clients?bt=PACKAGE`);
  await page.waitForSelector("tbody tr", { timeout: 15000 });
  await page.locator("tbody tr a").first().click();
  await page.waitForLoadState("networkidle");
  const cardHtml = await page.content();
  check(
    "Qabulxona abonement sotishi mumkin",
    cardHtml.includes("Abonement sotish"),
  );
  check(
    "Qabulxona to'lovni o'chira olmaydi",
    !cardHtml.includes('name="paymentId"'),
  );
}

/* 11. Ota-ona parol bilan kira olmaydi — faqat Telegram bot orqali */
await login(parent.phone);
check(
  "Ota-ona login sahifasidan kira olmaydi",
  page.url().includes("/login") &&
    (await page.locator("main").innerText()).includes("Telegram bot orqali kiradi"),
  page.url(),
);
await page.goto(`${BASE}/m`);
await page.waitForLoadState("networkidle");
check("Ota-onaga sessiya ochilmagan", !page.url().endsWith("/m"), page.url());

// Ilovaning o'z resurslari yuklanadimi (tashqi telegram.org bundan mustasno,
// ERR_ABORTED esa sahifadan sahifaga tez o'tganda bekor bo'lgan prefetch)
const ownFailures = [
  ...new Set(
    failedRequests
      .filter((f) => !f.url.includes("telegram.org") && !f.error.includes("ERR_ABORTED"))
      .map((f) => `${f.url} (${f.error})`),
  ),
];
check("Ilovaning o'z resurslari yuklanadi", ownFailures.length === 0, ownFailures.join(", "));

await browser.close();

await closeDb();

console.log("\n=== O'TDI ===");
for (const line of ok) console.log(`  ✓ ${line}`);
if (fails.length) {
  console.log("\n=== XATO ===");
  for (const line of fails) console.log(`  ✗ ${line}`);
}
console.log(`\nNatija: ${ok.length} o'tdi, ${fails.length} xato`);
process.exit(fails.length ? 1 : 0);

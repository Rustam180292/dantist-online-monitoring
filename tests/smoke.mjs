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
import Database from "better-sqlite3";

const { chromium } = playwright;
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const DB_PATH = process.env.SMOKE_DB ?? "prisma/dev.db";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "parol123";

const db = new Database(DB_PATH, { readonly: true });
const parent = db.prepare("SELECT phone FROM User WHERE role='PARENT' LIMIT 1").get();
const specialist = db.prepare("SELECT phone FROM User WHERE role='SPECIALIST' LIMIT 1").get();
const owner = db.prepare("SELECT phone FROM User WHERE role='OWNER' LIMIT 1").get();
const reception = db
  .prepare("SELECT phone, fullName FROM User WHERE role='RECEPTION' AND isActive=1 LIMIT 1")
  .get();

const count = (sql) => db.prepare(sql).get().n;

/** Shart bajarilishini kutadi (server action fon rejimida tugashi uchun) */
async function waitUntil(fn, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await fn()) return true;
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, 200));
  }
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

/* 1. Himoyalangan sahifa login'ga yo'naltiradi */
await page.goto(`${BASE}/`);
check("Auth: / -> /login", page.url().includes("/login"), page.url());

/* 2. Noto'g'ri parol rad etiladi */
await login(owner.phone, "notogri-parol");
check("Noto'g'ri parol rad etiladi", (await page.content()).includes("noto'g'ri"));

/* 3. Markaz egasi kiradi */
await login(owner.phone);
check("Markaz egasi kirdi", (await page.content()).includes("Assalomu alaykum"), page.url());

/* 4. Davomat belgilash */
await page.goto(`${BASE}/schedule`);
const doneBefore = count("SELECT COUNT(*) AS n FROM Session WHERE status='DONE'");
const doneBtn = page.locator('form button:has-text("O\'tdi")').first();
if (await doneBtn.count()) {
  await doneBtn.click();
  const grew = await waitUntil(
    async () => count("SELECT COUNT(*) AS n FROM Session WHERE status='DONE'") === doneBefore + 1,
  );
  check("Davomat \"O'tdi\" deb belgilanadi", grew, `${doneBefore} -> ${count("SELECT COUNT(*) AS n FROM Session WHERE status='DONE'")}`);
} else {
  check("Davomat belgilash", false, "rejadagi seans topilmadi");
}

/* 5. Yangi seans qo'shish */
await page.goto(`${BASE}/schedule?w=1`);
const sessBefore = count("SELECT COUNT(*) AS n FROM Session");
await page.click('summary:has-text("Yangi seans")');

// Mijoz va mutaxassis bitta filialdan bo'lishi kerak — ataylab mos juftlikni tanlaymiz
const pair = db
  .prepare(
    `SELECT c.id AS clientId, sp.id AS specialistId
       FROM Client c
       JOIN Specialist sp ON sp.branchId = c.branchId AND sp.isActive = 1
      WHERE c.status = 'ACTIVE'
      LIMIT 1`,
  )
  .get();
await page.selectOption("#clientId", pair.clientId);
await page.selectOption("#specialistId", pair.specialistId);

// Har yurishda bo'sh vaqt tanlaymiz: dastur band vaqtga seans qo'shishga to'g'ri
// yo'l qo'ymaydi, shuning uchun test ham har safar yangi kunni oladi.
const soon = new Date();
soon.setDate(soon.getDate() + 30 + (sessBefore % 60));
await page.fill("#startsAt", `${soon.toISOString().slice(0, 10)}T19:15`);
await page.click('form button:has-text("Qo\'shish")');
const sessGrew = await waitUntil(
  async () => count("SELECT COUNT(*) AS n FROM Session") === sessBefore + 1,
);
check("Yangi seans qo'shildi", sessGrew, `${sessBefore} -> ${count("SELECT COUNT(*) AS n FROM Session")}`);

/* 6. Mijozlar ro'yxati va kartasi */
await page.goto(`${BASE}/clients`);
check("Mijozlar ro'yxati to'ldi", (await page.locator("tbody tr").count()) > 0);
await page.locator("tbody tr a").first().click();
await page.waitForLoadState("networkidle");
check("Mijoz kartasi ochildi", (await page.content()).includes("Abonementlar"), page.url());

/* 7. To'lov qabul qilish */
const payBefore = count("SELECT COUNT(*) AS n FROM Payment");
await page.click('summary:has-text("To\'lov qabul qilish")');
await page.fill("#amount", "250000");
await page.click('form button:has-text("Qabul qilish")');
// Summa bir nechta qarzdor abonementga taqsimlanishi mumkin, shuning uchun
// "aynan bitta yozuv" emas, "yozuv qo'shildi" deb tekshiramiz
const payGrew = await waitUntil(
  async () => count("SELECT COUNT(*) AS n FROM Payment") > payBefore,
);
check("To'lov qabul qilindi", payGrew, `${payBefore} -> ${count("SELECT COUNT(*) AS n FROM Payment")}`);

/* 8. Abonement sotish */
const pkgBefore = count("SELECT COUNT(*) AS n FROM Package");
await page.click('summary:has-text("Abonement sotish")');
await page.fill("#pricePerSession", "130000");
await page.click('form button:has-text("Sotish")');
const pkgGrew = await waitUntil(
  async () => count("SELECT COUNT(*) AS n FROM Package") === pkgBefore + 1,
);
check("Abonement sotildi", pkgGrew, `${pkgBefore} -> ${count("SELECT COUNT(*) AS n FROM Package")}`);

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
    db
      .prepare(
        `SELECT (p.totalSessions * p.pricePerSession)
                - COALESCE((SELECT SUM(amount) FROM Payment WHERE packageId = p.id), 0) AS n
           FROM Package p WHERE p.id = ?`,
      )
      .get(packageId).n;

  const debtor = db
    .prepare(
      `SELECT c.id AS clientId, c.fullName AS clientName, p.id AS packageId
         FROM Package p
         JOIN Client c ON c.id = p.clientId
        WHERE p.isActive = 1 AND c.status = 'ACTIVE'
          AND (p.totalSessions * p.pricePerSession) >
              COALESCE((SELECT SUM(amount) FROM Payment WHERE packageId = p.id), 0)
        ORDER BY p.purchasedAt ASC
        LIMIT 1`,
    )
    .get();

  if (!debtor) {
    check("To'lovlar sahifasidan to'lov kiritiladi", false, "qarzdor topilmadi");
  } else {
    const debtBefore = packageDebt(debtor.packageId);
    const paymentsBefore = count("SELECT COUNT(*) AS n FROM Payment");

    await page.goto(`${BASE}/payments`);
    await page.waitForLoadState("networkidle");
    await page.click('summary:has-text("To\'lov qabul qilish")');
    await page.selectOption("#clientId", debtor.clientId);
    await page.fill("#amount", String(debtBefore));
    await page.click('form button:has-text("Qabul qilish")');

    const paid = await waitUntil(
      async () => count("SELECT COUNT(*) AS n FROM Payment") > paymentsBefore,
    );
    check(
      "To'lovlar sahifasidan to'lov kiritiladi",
      paid,
      `${paymentsBefore} -> ${count("SELECT COUNT(*) AS n FROM Payment")}`,
    );
    check(
      "To'lov qarzni avtomatik yopadi",
      packageDebt(debtor.packageId) === 0,
      `qarz: ${debtBefore} -> ${packageDebt(debtor.packageId)}`,
    );
  }
}

/* 9b. Mutaxassisga ish haqi to'lab berish */
await page.goto(`${BASE}/specialists`);
await page.waitForLoadState("networkidle");
const payoutBefore = count("SELECT COUNT(*) AS n FROM SalaryPayout");
const payRow = page
  .locator("form")
  .filter({ has: page.locator('button:has-text("to\'lash")') })
  .first();
if (await payRow.count()) {
  await payRow.locator('input[name="amount"]').fill("100000");
  await payRow.locator('button:has-text("to\'lash")').click();
  const payoutGrew = await waitUntil(
    async () => count("SELECT COUNT(*) AS n FROM SalaryPayout") === payoutBefore + 1,
  );
  check(
    "Ish haqi to'lab berildi",
    payoutGrew,
    `${payoutBefore} -> ${count("SELECT COUNT(*) AS n FROM SalaryPayout")}`,
  );
  await page.waitForLoadState("networkidle");
  // Pul formatlashda uzilmas probel (\u00a0) ishlatiladi — solishtirishdan oldin tenglashtiramiz
  const shown = (await page.content()).replace(/\u00a0/g, " ");
  check("Ish haqi to'lovi ro'yxatda ko'rinadi", shown.includes("100 000 so'm"));
} else {
  check("Ish haqi to'lab berildi", false, "to'lash tugmasi topilmadi");
}

/* 9c. Mutaxassis o'z pulini ko'radi */
{
  const specRow = db
    .prepare(
      "SELECT s.id FROM Specialist s JOIN User u ON u.id = s.userId WHERE u.phone = ? LIMIT 1",
    )
    .get(specialist.phone);
  const accrued = count(
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
}

/* 10. Mutaxassis roli chegaralangan */
await login(specialist.phone);
check(
  "Mutaxassis telefon kabinetiga tushadi",
  page.url().endsWith("/m") && (await page.content()).includes("Qolgan pulim"),
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
await page.goto(`${BASE}/payments`);
check("Mutaxassis /payments ga kira olmaydi", !page.url().includes("/payments"), page.url());

await page.goto(`${BASE}/earnings`);
await page.waitForLoadState("networkidle");
const earningsBody = await page.content();
check(
  "Mutaxassis 'Pulim' sahifasini ko'radi",
  earningsBody.includes("Qolgan (olishim kerak)") && earningsBody.includes("Jami hisoblangan"),
  page.url(),
);

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
    "Qabulxonada faqat 3 bo'lim bor",
    recNav.includes("Jadval") &&
      recNav.includes("Mijozlar") &&
      recNav.includes("To'lovlar") &&
      !recNav.includes("Hisobotlar") &&
      !recNav.includes("Xodimlar") &&
      !recNav.includes("Panel"),
    recNav.replace(/\n/g, " | "),
  );

  await page.goto(`${BASE}/reports`);
  check("Qabulxona hisobotlarni ko'ra olmaydi", !page.url().includes("/reports"), page.url());

  await page.goto(`${BASE}/specialists`);
  check("Qabulxona xodimlar bo'limiga kira olmaydi", !page.url().includes("/specialists"), page.url());

  // To'lov qabul qila oladimi
  const recPayBefore = count("SELECT COUNT(*) AS n FROM Payment");
  await page.goto(`${BASE}/payments`);
  await page.waitForLoadState("networkidle");
  check("Qabulxona to'lovlar sahifasini ko'radi", (await page.content()).includes("Jami tushum"));

  await page.click('summary:has-text("To\'lov qabul qilish")');
  await page.fill("#amount", "150000");
  await page.click('form button:has-text("Qabul qilish")');
  const recPaid = await waitUntil(
    async () => count("SELECT COUNT(*) AS n FROM Payment") > recPayBefore,
  );
  check("Qabulxona to'lov qabul qila oladi", recPaid);

  // Mijoz kartasida to'lovni o'chirish tugmasi ko'rinmasligi kerak
  await page.goto(`${BASE}/clients`);
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

/* 11. Ota-ona kabineti */
await login(parent.phone);
check(
  "Ota-ona telefon kabinetiga tushadi",
  page.url().endsWith("/m") && (await page.content()).includes("Keyingi mashg"),
  page.url(),
);
check("Ota-onaga qolgan seans ko'rsatiladi", (await page.content()).includes("Qolgan seans"));

await page.goto(`${BASE}/my`);
await page.waitForLoadState("networkidle");
check(
  "Ota-onaning to'liq ko'rinishi ham ishlaydi",
  (await page.content()).includes("Farzandim"),
  page.url(),
);
await page.goto(`${BASE}/clients`);
check(
  "Ota-ona boshqa mijozlarni ko'rmaydi",
  !(await page.content()).includes("Yangi mijoz qo'shish"),
  page.url(),
);

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

console.log("\n=== O'TDI ===");
for (const line of ok) console.log(`  ✓ ${line}`);
if (fails.length) {
  console.log("\n=== XATO ===");
  for (const line of fails) console.log(`  ✗ ${line}`);
}
console.log(`\nNatija: ${ok.length} o'tdi, ${fails.length} xato`);
process.exit(fails.length ? 1 : 0);

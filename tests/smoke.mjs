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

page.on("pageerror", (e) =>
  fails.push(`JS xatolik @ ${page.url()}: ${e.message.split("\n")[0]}`),
);
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("favicon")) {
    fails.push(`Konsol xatosi @ ${page.url()}: ${m.text().split("\n")[0]}`);
  }
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

const soon = new Date();
soon.setDate(soon.getDate() + 9);
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
const payGrew = await waitUntil(
  async () => count("SELECT COUNT(*) AS n FROM Payment") === payBefore + 1,
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
const payBtn = page.locator('form button:has-text("to\'lash")').first();
if (await payBtn.count()) {
  await payBtn.click();
  const payoutGrew = await waitUntil(
    async () => count("SELECT COUNT(*) AS n FROM SalaryPayout") === payoutBefore + 1,
  );
  check(
    "Ish haqi to'lab berildi",
    payoutGrew,
    `${payoutBefore} -> ${count("SELECT COUNT(*) AS n FROM SalaryPayout")}`,
  );
  // To'lovdan keyin "qolgan" nolga tushishi kerak (butun qoldiq to'landi)
  await page.waitForLoadState("networkidle");
  check(
    "Qolgan summa yangilandi",
    (await page.content()).includes("0 so'm"),
  );
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

/* 10. Mutaxassis roli chegaralangan */
await login(specialist.phone);
check("Mutaxassis kirdi", (await page.content()).includes("Assalomu alaykum"));
const navText = await page.locator("aside").innerText();
check("Mutaxassisga to'lov/hisobot menyusi berkitilgan", !navText.includes("Hisobotlar"));
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

/* 11. Ota-ona kabineti */
await login(parent.phone);
check(
  "Ota-ona kabineti ochildi",
  page.url().includes("/my") && (await page.content()).includes("Farzandim"),
  page.url(),
);
check("Ota-onaga qolgan seans ko'rsatiladi", (await page.content()).includes("Qolgan seans"));
await page.goto(`${BASE}/clients`);
check(
  "Ota-ona boshqa mijozlarni ko'rmaydi",
  !(await page.content()).includes("Yangi mijoz qo'shish"),
  page.url(),
);

await browser.close();

console.log("\n=== O'TDI ===");
for (const line of ok) console.log(`  ✓ ${line}`);
if (fails.length) {
  console.log("\n=== XATO ===");
  for (const line of fails) console.log(`  ✗ ${line}`);
}
console.log(`\nNatija: ${ok.length} o'tdi, ${fails.length} xato`);
process.exit(fails.length ? 1 : 0);

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

/* 10. Mutaxassis roli chegaralangan */
await login(specialist.phone);
check("Mutaxassis kirdi", (await page.content()).includes("Assalomu alaykum"));
const navText = await page.locator("aside").innerText();
check("Mutaxassisga to'lov/hisobot menyusi berkitilgan", !navText.includes("Hisobotlar"));
await page.goto(`${BASE}/payments`);
check("Mutaxassis /payments ga kira olmaydi", !page.url().includes("/payments"), page.url());

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

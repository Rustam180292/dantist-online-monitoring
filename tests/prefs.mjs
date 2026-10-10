/**
 * Ko'rinish sozlamalari: tun/kun rejimi, interfeys tili (uz/en/ru) va markaz
 * logotipi.
 *
 * Ishga tushirish (smoke.mjs bilan bir xil):
 *   npm run build && npm start -- -p 3100   (boshqa terminalda)
 *   node tests/prefs.mjs
 */
import playwright from "playwright";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { closeDb, one } from "./db.mjs";

const { chromium } = playwright;
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "parol123";

const owner = await one("SELECT phone FROM User WHERE role='OWNER' AND isActive = true LIMIT 1");
const reception = await one("SELECT phone FROM User WHERE role='RECEPTION' AND isActive = true LIMIT 1");

const ok = [];
const fails = [];
const check = (name, cond, extra = "") =>
  (cond ? ok : fails).push(`${name}${extra ? ` — ${extra}` : ""}`);

/* ---------- 1. Lug'at to'liqligi (brauzersiz) ----------
 * Kodda t("...") bilan yozilgan har bir matnning inglizcha va ruscha
 * tarjimasi bo'lishi kerak — aks holda sahifada o'zbekcha so'z chiqib qoladi.
 * O'rinbosarlar ({n}, {sum}) tarjimada ham bir xil bo'lishi shart. */
{
  const dict = (name) => {
    const src = readFileSync(new URL(`../src/lib/i18n/${name}.ts`, import.meta.url), "utf8");
    const body = src.slice(src.indexOf("{"), src.lastIndexOf("}") + 1);
    return JSON.parse(body.replace(/,\s*}$/, "}"));
  };
  const en = dict("en");
  const ru = dict("ru");

  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        // Telegram bot xabarlari va generatsiya qilingan kod tarjima qilinmaydi
        if (!["generated", "tg"].includes(name)) walk(p);
      } else if (/\.(ts|tsx)$/.test(name) && !/i18n\/(en|ru)\.ts$/.test(p)) files.push(p);
    }
  };
  walk(new URL("../src", import.meta.url).pathname);

  const keys = new Set();
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    // t("..."), shuningdek setFlash va throw new Error matnlari (ular setFlash ichida tarjima qilinadi)
    for (const m of src.matchAll(/(?:(?<![\w.])t|setFlash|new Error)\(\s*"((?:[^"\\]|\\.)*)"/g)) {
      keys.add(JSON.parse(`"${m[1]}"`));
    }
  }
  const missing = [...keys].filter((k) => !(k in en) || !(k in ru));
  check(`Har bir matnning en/ru tarjimasi bor (${keys.size} ta)`, missing.length === 0, missing.slice(0, 5).join(" | "));

  const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  const badVars = Object.keys(en).filter((k) => vars(k) !== vars(en[k]) || vars(k) !== vars(ru[k] ?? ""));
  check("Tarjimadagi o'rinbosarlar mos", badVars.length === 0, badVars.slice(0, 5).join(" | "));
}

const browser = await chromium.launch();

async function newPage(cookies = []) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (cookies.length) await ctx.addCookies(cookies.map((c) => ({ ...c, url: BASE })));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fails.push(`JS xatolik @ ${page.url()}: ${e.message.split("\n")[0]}`));
  return { ctx, page };
}

async function login(page, phone) {
  await page.goto(`${BASE}/login`);
  await page.fill("#phone", phone);
  await page.fill("#password", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForLoadState("networkidle");
}

const bodyText = (page) => page.locator("body").innerText();
const isDark = (page) => page.evaluate(() => document.documentElement.classList.contains("dark"));

/* ---------- 2. Tun/kun rejimi ---------- */
{
  // Tanlov bo'lmasa qurilma mavzusiga ergashadi
  const { ctx, page } = await newPage();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`${BASE}/login`);
  check("Tanlov bo'lmasa qurilmaning tungi mavzusi olinadi", await isDark(page));
  await page.emulateMedia({ colorScheme: "light" });
  await page.reload();
  check("Tanlov bo'lmasa qurilmaning kunduzgi mavzusi olinadi", !(await isDark(page)));

  // Tugma rejimni almashtiradi va tanlov sahifa yangilanganda ham saqlanadi
  await page.click('[data-testid="theme-toggle"]');
  check("Tugma tungi rejimni yoqadi", await isDark(page));
  await page.reload();
  check("Tanlangan rejim yangilangandan keyin ham qoladi (qurilma kunduzgi bo'lsa ham)", await isDark(page));

  await login(page, owner.phone);
  check("Kirgandan keyin ham tanlangan rejim saqlanadi", await isDark(page));

  // Kunduzgi rejimda fon mentol rangda, tungi rejim ranglari o'zgarmagan
  // Tungi rejimda kunduzgi ranglar qo'llanmaydi: asosiy rang va fonlar asl Tailwind qiymatida
  const darkVars = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    return [css.getPropertyValue("--color-indigo-600").trim(), css.getPropertyValue("--color-slate-50").trim()];
  });
  check(
    "Tungi rejim ranglari avvalgidek",
    darkVars[0] !== "#0a7ba5" && darkVars[1] !== "#effbf6",
    darkVars.join(" / "),
  );
  await page.locator('[data-testid="topbar"] [data-testid="theme-toggle"]').click();
  check("Tepa paneldagi tugma kunduzgi rejimga qaytaradi", !(await isDark(page)));
  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--color-indigo-600").trim(),
  );
  check("Kunduzgi rejimda asosiy rang havo rang", accent === "#0a7ba5", accent);
  await ctx.close();
}

/* ---------- 3. Til ---------- */
{
  const { ctx, page } = await newPage();
  await page.goto(`${BASE}/login`);
  check("Standart til o'zbekcha", (await bodyText(page)).includes("Telefon raqam"));

  await page.click('[data-testid="lang-en"]');
  await page.waitForFunction(() => document.body.innerText.includes("Phone number"), null, { timeout: 8000 }).catch(() => {});
  check("Kirish sahifasi inglizchaga o'tadi", (await bodyText(page)).includes("Phone number"));

  await login(page, owner.phone);
  let text = await bodyText(page);
  check("Menyu inglizcha", text.includes("Clients") && text.includes("Settings") && !text.includes("Mijozlar"));
  check("Pul birligi tilga mos (UZS)", text.includes("UZS") && !text.includes("so'm"));
  check("Sahifa tili <html lang> da", (await page.evaluate(() => document.documentElement.lang)) === "en");

  // Amal xabari ham tanlangan tilda chiqadi
  await page.goto(`${BASE}/settings`);
  await page.fill("#currentPassword", "notogri-parol");
  await page.fill("#newPassword", "12345");
  await page.fill("#repeatPassword", "12345");
  await page.locator('form:has(#currentPassword) button[type="submit"]').click();
  const flash = await page
    .getByText("Current password is incorrect.")
    .waitFor({ timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  check("Xato xabari inglizcha", flash);

  await page.click('[data-testid="lang-ru"]');
  await page.waitForFunction(() => document.body.innerText.includes("Настройки"), null, { timeout: 8000 }).catch(() => {});
  text = await bodyText(page);
  check("Sozlamalardan ruschaga o'tadi", text.includes("Настройки") && text.includes("Клиенты"));

  await page.goto(`${BASE}/schedule`);
  await page.waitForLoadState("networkidle");
  text = await bodyText(page);
  check("Hafta kunlari ruscha", /Понедельник|Вторник|Среда|Четверг|Пятница|Суббота|Воскресенье/.test(text));

  await page.click('[data-testid="lang-uz"]');
  await page.waitForFunction(() => document.body.innerText.includes("Jadval"), null, { timeout: 8000 }).catch(() => {});
  check("O'zbekchaga qaytadi", (await bodyText(page)).includes("Mijozlar"));
  await ctx.close();
}

/* ---------- 4. Logotip ---------- */
// 1x1 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
  "base64",
);
{
  const { ctx, page } = await newPage();
  await login(page, owner.phone);
  await page.goto(`${BASE}/settings`);

  // Rasm bo'lmagan fayl (nomi .png bo'lsa ham) rad etiladi
  await page.setInputFiles("#logo", { name: "logo.png", mimeType: "image/png", buffer: Buffer.from("<svg></svg>") });
  await page.locator('form:has(#logo) button[type="submit"]').click();
  const rejected = await page
    .getByText("Faqat PNG, JPG yoki WEBP rasm yuklash mumkin.")
    .waitFor({ timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  check("Rasm bo'lmagan fayl rad etiladi", rejected);
  check("Rad etilgan fayl bazaga yozilmaydi", !(await one("SELECT logoMime FROM Settings WHERE id='main'"))?.logoMime);

  await page.setInputFiles("#logo", { name: "logo.png", mimeType: "image/png", buffer: PNG });
  await page.locator('form:has(#logo) button[type="submit"]').click();
  await page.getByText("Logotip saqlandi.").waitFor({ timeout: 8000 }).catch(() => {});
  const row = await one("SELECT logoMime FROM Settings WHERE id='main'");
  check("Logotip bazaga yoziladi", row?.logoMime === "image/png", row?.logoMime ?? "yo'q");

  await page.goto(`${BASE}/`);
  await page.waitForLoadState("networkidle");
  const src = await page.locator('aside [data-testid="brand-logo"]').getAttribute("src").catch(() => null);
  check("Logotip menyuda ko'rinadi", Boolean(src?.startsWith("/api/logo?v=")), src ?? "yo'q");

  const res = await fetch(`${BASE}${src}`);
  check(
    "Logotip manzili rasmni qaytaradi",
    res.status === 200 && res.headers.get("content-type") === "image/png",
    `${res.status} ${res.headers.get("content-type")}`,
  );

  // Kirish sahifasida ham ko'rinadi (kirmagan odam uchun)
  const anon = await newPage();
  await anon.page.goto(`${BASE}/login`);
  check("Logotip kirish sahifasida ko'rinadi", (await anon.page.locator('[data-testid="brand-logo"]').count()) === 1);
  await anon.ctx.close();

  // Faqat ega o'zgartira oladi: qabulxona xodimi formani ko'rmaydi
  if (reception) {
    const rec = await newPage();
    await login(rec.page, reception.phone);
    await rec.page.goto(`${BASE}/settings`);
    check("Qabulxona xodimiga logotip formasi ko'rinmaydi", (await rec.page.locator("#logo").count()) === 0);
    await rec.ctx.close();
  }

  await page.goto(`${BASE}/settings`);
  await page.getByRole("button", { name: "Logotipni olib tashlash" }).click();
  await page.getByText("Logotip olib tashlandi.").waitFor({ timeout: 8000 }).catch(() => {});
  check("Logotip olib tashlanadi", !(await one("SELECT logoMime FROM Settings WHERE id='main'"))?.logoMime);
  check("Logotip yo'q bo'lsa manzil 404", (await fetch(`${BASE}/api/logo`)).status === 404);
  await ctx.close();
}

/* ---------- 5. Katta rasm brauzerda kichrayadi ---------- */
{
  const { ctx, page } = await newPage();
  await login(page, owner.phone);
  await page.goto(`${BASE}/settings`);

  // Telefon rasmiga o'xshash katta fayl yasaymiz: shovqinli rasm siqilmaydi,
  // shuning uchun PNG hajmi 500 KB dan oshadi
  const big = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 1400;
    c.height = 1400;
    const ctx2d = c.getContext("2d");
    const img = ctx2d.createImageData(c.width, c.height);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = (Math.random() * 256) | 0;
      img.data[i + 1] = (Math.random() * 256) | 0;
      img.data[i + 2] = (Math.random() * 256) | 0;
      img.data[i + 3] = 255;
    }
    ctx2d.putImageData(img, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (const b of buf) bin += String.fromCharCode(b);
    return btoa(bin);
  });
  const bigBuffer = Buffer.from(big, "base64");
  check(
    "Sinov rasmi haqiqatan katta",
    bigBuffer.length > 500 * 1024,
    `${Math.round(bigBuffer.length / 1024)} KB`,
  );

  await page.setInputFiles("#logo", {
    name: "telefon-rasmi.png",
    mimeType: "image/png",
    buffer: bigBuffer,
  });
  // Kichraytirilgani haqida xabar chiqishi kerak
  const shrunk = await page
    .getByText("Rasm kichraytirildi")
    .waitFor({ timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  check("Katta rasm brauzerda kichraytiriladi", shrunk);

  await page.locator('form:has(#logo) button[type="submit"]').click();
  await page.getByText("Logotip saqlandi.").waitFor({ timeout: 15000 }).catch(() => {});
  const saved = await one("SELECT logoMime, logoData FROM Settings WHERE id='main'");
  check(
    "Kichraytirilgan rasm serverga yetib boradi",
    Boolean(saved?.logoMime) && Buffer.from(saved.logoData, "base64").length <= 500 * 1024,
    saved?.logoData ? `${Math.round(Buffer.from(saved.logoData, "base64").length / 1024)} KB` : "yo'q",
  );

  await page.getByRole("button", { name: "Logotipni olib tashlash" }).click();
  await page.getByText("Logotip olib tashlandi.").waitFor({ timeout: 8000 }).catch(() => {});
  await ctx.close();
}

/* ---------- 5b. Tepa o'ng burchak: til, rejim, foydalanuvchi menyusi ---------- */
{
  const { ctx, page } = await newPage();
  await login(page, owner.phone);
  await page.goto(`${BASE}/`);
  await page.waitForLoadState("networkidle");
  const bar = page.locator('[data-testid="topbar"]');
  const box = await bar.boundingBox();
  check(
    "Kompyuterda tepa panelda til, rejim va menyu bor",
    (await bar.locator('[data-testid="lang-uz"]').isVisible()) &&
      (await bar.locator('[data-testid="theme-toggle"]').isVisible()) &&
      (await bar.locator('[data-testid="user-menu"]').isVisible()) &&
      !!box && box.y === 0,
  );
  const menuBox = await bar.locator('[data-testid="user-menu"]').boundingBox();
  check("Menyu o'ng burchakda", !!menuBox && menuBox.x + menuBox.width > 1280 - 80, JSON.stringify(menuBox));
  check(
    "Yon menyuda til/rejim/chiqish takrorlanmaydi",
    (await page.locator('aside [data-testid="theme-toggle"]').count()) === 0 &&
      !(await page.locator("aside").innerText()).includes("Chiqish"),
  );

  // Til tepa paneldan almashadi
  await bar.locator('[data-testid="lang-en"]').click();
  // Til cookie'ga yoziladi va sahifa serverdan qayta chiziladi — matn kelguncha kutamiz
  const switched = await page
    .waitForFunction(() => document.querySelector("aside")?.textContent?.includes("Clients"), null, { timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  check("Tepa paneldan til almashadi", switched);
  await bar.locator('[data-testid="lang-uz"]').click();
  // Sahifa o'zbekchada qayta chizilib bo'lishini kutamiz — aks holda menyu
  // tugmasi qayta chizilish paytida bosilib, ochilmay qolishi mumkin
  await page.waitForFunction(() => document.querySelector("aside")?.textContent?.includes("Mijozlar"), null, { timeout: 10000 });
  await page.waitForLoadState("networkidle");

  // Menyu ochiladi, tashqariga bosilsa yopiladi, Chiqish ishlaydi
  await bar.locator('[data-testid="user-menu"]').click();
  const menu = page.locator('[role="menu"]');
  const opened = await menu.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false);
  check("Foydalanuvchi menyusi ochiladi", opened && (await menu.innerText()).includes("Chiqish"));
  await page.mouse.click(600, 500);
  check("Tashqariga bosilsa menyu yopiladi", (await menu.count()) === 0);
  await bar.locator('[data-testid="user-menu"]').click();
  await menu.locator('button:has-text("Chiqish")').click();
  await page.waitForURL(/\/login/, { timeout: 10000 }).catch(() => {});
  check("Menyudan chiqish ishlaydi", page.url().includes("/login"), page.url());
  await ctx.close();
}

/* ---------- 5c. Telefonda ham sarlavhaning o'ng tomonida ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 360, height: 760 } });
  const page = await ctx.newPage();
  await login(page, owner.phone);
  await page.goto(`${BASE}/`);
  await page.waitForLoadState("networkidle");
  const head = page.locator("header:visible").first();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  check(
    "Telefonda til, rejim va menyu sarlavhada, sahifa yonga oshmaydi",
    (await head.locator('[data-testid="lang-ru"]').isVisible()) &&
      (await head.locator('[data-testid="theme-toggle"]').isVisible()) &&
      (await head.locator('[data-testid="user-menu"]').isVisible()) &&
      width <= 360,
    `scrollWidth=${width}`,
  );
  await ctx.close();
}

/* ---------- 6. Bir nechta rejim tugmasi bir-biriga mos ---------- */
{
  const { ctx, page } = await newPage();
  await login(page, owner.phone);
  await page.goto(`${BASE}/settings`);

  const toggles = page.locator('[data-testid="theme-toggle"]');
  const n = await toggles.count();
  check("Sozlamalarda bir nechta rejim tugmasi bor", n >= 2, `${n} ta`);

  if (n >= 2) {
    const labels = async () =>
      Promise.all(
        Array.from({ length: n }, (_, i) => toggles.nth(i).getAttribute("aria-label")),
      );
    const before = await labels();
    await toggles.first().click();
    await page.waitForTimeout(300);
    const after = await labels();
    check(
      "Bitta tugma bosilsa qolganlari ham yangilanadi",
      new Set(after).size === 1 && after[0] !== before[0],
      `${before.join(" / ")} -> ${after.join(" / ")}`,
    );
  }
  await ctx.close();
}

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

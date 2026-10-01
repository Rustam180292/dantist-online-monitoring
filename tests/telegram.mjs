/**
 * Telegram oqimini tekshiradi: bot webhook'i orqali akkauntni bog'lash,
 * Mini App imzosini (initData) tasdiqlash va mutaxassis kabinetining ishlashi.
 *
 * Imzo haqiqiy HMAC-SHA256 bilan yasaladi, ya'ni ishlab chiqarishdagi
 * tekshiruv kodi aynan shu yo'l bilan sinaladi.
 *
 * Ishga tushirish (server .env dagi TELEGRAM_BOT_TOKEN bilan ishlab turishi kerak):
 *   node tests/telegram.mjs
 */
import { createHmac } from "node:crypto";
import playwright from "playwright";
import Database from "better-sqlite3";
import "dotenv/config";

const { chromium } = playwright;
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const DB_PATH = process.env.SMOKE_DB ?? "prisma/dev.db";
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";

if (!BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN .env da yo'q — test ishlamaydi.");
  process.exit(1);
}

const db = new Database(DB_PATH, { readonly: true });
const one = (sql, ...args) => db.prepare(sql).get(...args);

const ok = [];
const fails = [];
const check = (name, cond, extra = "") =>
  (cond ? ok : fails).push(`${name}${extra ? ` — ${extra}` : ""}`);

/** Telegram Mini App initData'sini yasaydi (haqiqiy imzo bilan) */
function makeInitData(tgUser, { authDate = Math.floor(Date.now() / 1000), withSignature = false } = {}) {
  const params = new URLSearchParams();
  params.set("auth_date", String(authDate));
  params.set("query_id", "AAE1234567890");
  params.set("user", JSON.stringify(tgUser));
  if (withSignature) params.set("signature", "soxta_ed25519_imzo");

  const checkString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");

  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  params.set("hash", createHmac("sha256", secret).update(checkString).digest("hex"));
  return params.toString();
}

const webhook = (payload, secret = WEBHOOK_SECRET) =>
  fetch(`${BASE}/api/tg/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "x-telegram-bot-api-secret-token": secret } : {}),
    },
    body: JSON.stringify(payload),
  });

const specialist = one(
  "SELECT u.id, u.phone, u.fullName FROM User u WHERE u.role='SPECIALIST' LIMIT 1",
);
const parent = one("SELECT id, phone, fullName FROM User WHERE role='PARENT' LIMIT 1");

const SPEC_TG_ID = 900100100;
const PARENT_TG_ID = 900200200;
const STRANGER_TG_ID = 900300300;

/* 1. Noto'g'ri maxfiy so'z bilan webhook rad etiladi */
{
  const res = await webhook({ message: { chat: { id: 1 }, text: "/start" } }, "notogri-sir");
  check("Webhook noto'g'ri sir bilan rad etiladi", res.status === 403, `status ${res.status}`);
}

/* 2. /start — bog'lanmagan foydalanuvchi */
{
  const res = await webhook({
    message: { chat: { id: SPEC_TG_ID }, from: { id: SPEC_TG_ID }, text: "/start" },
  });
  check("/start qabul qilinadi", res.status === 200, `status ${res.status}`);
}

/* 3. Begona odamning kontaktini yuborish bog'lamaydi */
{
  const before = one("SELECT telegramId FROM User WHERE id=?", specialist.id).telegramId;
  await webhook({
    message: {
      chat: { id: STRANGER_TG_ID },
      from: { id: STRANGER_TG_ID },
      contact: { phone_number: specialist.phone, user_id: SPEC_TG_ID }, // user_id ≠ from.id
    },
  });
  const after = one("SELECT telegramId FROM User WHERE id=?", specialist.id).telegramId;
  const strangerLinked = one(
    "SELECT COUNT(*) AS n FROM User WHERE telegramId=?",
    String(STRANGER_TG_ID),
  ).n;
  check(
    "Begona kontakt bilan bog'lanmaydi",
    after === before && strangerLinked === 0,
    `oldin=${before} keyin=${after} begona=${strangerLinked}`,
  );
}

/* 4. O'z kontaktini yuborish — bog'lanadi */
{
  await webhook({
    message: {
      chat: { id: SPEC_TG_ID },
      from: { id: SPEC_TG_ID, username: "mutaxassis_demo" },
      contact: { phone_number: specialist.phone, user_id: SPEC_TG_ID },
    },
  });
  const row = one("SELECT telegramId, telegramUsername FROM User WHERE id=?", specialist.id);
  check(
    "Mutaxassis akkaunti bog'landi",
    row.telegramId === String(SPEC_TG_ID),
    `telegramId=${row.telegramId}`,
  );
}

/* 5. Bazada yo'q raqam bog'lanmaydi */
{
  const res = await webhook({
    message: {
      chat: { id: 999777 },
      from: { id: 999777 },
      contact: { phone_number: "+998900000000", user_id: 999777 },
    },
  });
  const row = one("SELECT COUNT(*) AS n FROM User WHERE telegramId='999777'");
  check("Begona raqam bog'lanmaydi", res.status === 200 && row.n === 0);
}

/* 6. Ota-ona ham bog'lanadi */
{
  await webhook({
    message: {
      chat: { id: PARENT_TG_ID },
      from: { id: PARENT_TG_ID },
      contact: { phone_number: parent.phone, user_id: PARENT_TG_ID },
    },
  });
  const row = one("SELECT telegramId FROM User WHERE id=?", parent.id);
  check("Ota-ona akkaunti bog'landi", row.telegramId === String(PARENT_TG_ID));
}

/* 7. Buzilgan initData rad etiladi */
{
  const bad = makeInitData({ id: SPEC_TG_ID, first_name: "Test" }).replace(/hash=[a-f0-9]+/, "hash=" + "0".repeat(64));
  const res = await fetch(`${BASE}/api/tg/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData: bad }),
  });
  check("Soxta imzo rad etiladi", res.status === 401, `status ${res.status}`);
}

/* 8. Eskirgan initData rad etiladi */
{
  const old = makeInitData(
    { id: SPEC_TG_ID, first_name: "Test" },
    { authDate: Math.floor(Date.now() / 1000) - 60 * 60 * 48 },
  );
  const res = await fetch(`${BASE}/api/tg/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData: old }),
  });
  check("Eskirgan initData rad etiladi", res.status === 401, `status ${res.status}`);
}

/* 9. Bog'lanmagan Telegram akkaunti kabinetga kira olmaydi */
{
  const res = await fetch(`${BASE}/api/tg/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData: makeInitData({ id: 123123123, first_name: "Begona" }) }),
  });
  const body = await res.json().catch(() => ({}));
  check(
    "Bog'lanmagan akkaunt kirita olmaydi",
    res.status === 403 && body.error === "not_linked",
    `status ${res.status}`,
  );
}

/* 10. To'g'ri imzo — sessiya ochiladi (signature maydoni bilan ham) */
let sessionCookie = null;
for (const withSignature of [false, true]) {
  const res = await fetch(`${BASE}/api/tg/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData: makeInitData({ id: SPEC_TG_ID, first_name: "Demo" }, { withSignature }) }),
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  check(
    `To'g'ri imzo qabul qilinadi${withSignature ? " (signature bilan)" : ""}`,
    res.status === 200 && setCookie.includes("logoped_session"),
    `status ${res.status}`,
  );
  const match = setCookie.match(/logoped_session=([^;]+)/);
  if (match) sessionCookie = match[1];
}

if (!sessionCookie) {
  console.log("Sessiya cookie olinmadi — brauzer qismi o'tkazib yuborildi.");
} else {
  /* 11. Mini App brauzerda ochiladi */
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
  await ctx.addCookies([
    {
      name: "logoped_session",
      value: sessionCookie,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const page = await ctx.newPage();
  const failedRequests = [];
  page.on("requestfailed", (r) =>
    failedRequests.push({ url: r.url(), error: r.failure()?.errorText ?? "" }),
  );
  page.on("pageerror", (e) => fails.push(`JS xatolik @ ${page.url()}: ${e.message.split("\n")[0]}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    // Resurs yuklanmagani pastda requestfailed orqali alohida tekshiriladi:
    // sinov muhitida telegram.org ga chiqish yopiq, bu ilovaning kamchiligi emas.
    if (text.includes("favicon")) return;
    if (text.includes("Failed to load resource") || text.trim() === "Event") return;
    fails.push(`Konsol xatosi @ ${page.url()}: ${text.split("\n")[0]}`);
  });

  await page.goto(`${BASE}/tg/app`);
  await page.waitForLoadState("networkidle");
  const body = await page.content();
  check(
    "Mini App mutaxassis kabinetini ochadi",
    body.includes(specialist.fullName) && body.includes("Qolgan pulim"),
    page.url(),
  );
  check("Tab'lar bor", body.includes("Mijozlarim") && body.includes("Pulim"));

  /* 12. Mini App'dan davomat belgilash */
  const doneBefore = one("SELECT COUNT(*) AS n FROM Session WHERE status='DONE'").n;
  await page.goto(`${BASE}/tg/app?tab=week`);
  await page.waitForLoadState("networkidle");
  const btn = page.locator('form button:has-text("O\'tdi")').first();
  if (await btn.count()) {
    await btn.click();
    const deadline = Date.now() + 8000;
    let grew = false;
    while (Date.now() < deadline) {
      if (one("SELECT COUNT(*) AS n FROM Session WHERE status='DONE'").n === doneBefore + 1) {
        grew = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    check("Mini App'dan davomat belgilanadi", grew);
  } else {
    check("Mini App'dan davomat belgilanadi", false, "rejadagi seans topilmadi");
  }

  /* 13. "Pulim" bo'limi */
  await page.goto(`${BASE}/tg/app?tab=money`);
  await page.waitForLoadState("networkidle");
  const money = await page.content();
  check(
    "Pulim bo'limi hisobni ko'rsatadi",
    money.includes("Jami hisoblangan") && money.includes("Jami to'langan"),
  );

  /* 14. Mijozlarim bo'limi */
  await page.goto(`${BASE}/tg/app?tab=clients`);
  await page.waitForLoadState("networkidle");
  check("Mijozlarim bo'limi ishlaydi", (await page.content()).includes("seans"));

  /* 15. Ota-ona Mini App'da o'z ko'rinishini oladi */
  const parentRes = await fetch(`${BASE}/api/tg/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData: makeInitData({ id: PARENT_TG_ID, first_name: "Ota" }) }),
  });
  const parentCookie = (parentRes.headers.get("set-cookie") ?? "").match(/logoped_session=([^;]+)/);
  if (parentCookie) {
    const pctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
    await pctx.addCookies([
      { name: "logoped_session", value: parentCookie[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
    ]);
    const ppage = await pctx.newPage();
    await ppage.goto(`${BASE}/tg/app`);
    await ppage.waitForLoadState("networkidle");
    const pbody = await ppage.content();
    check(
      "Ota-ona Mini App'da o'z ko'rinishini oladi",
      pbody.includes(parent.fullName) && !pbody.includes("Qolgan pulim"),
    );
  } else {
    check("Ota-ona Mini App'da o'z ko'rinishini oladi", false, "cookie olinmadi");
  }

  /* 16. Ilovaning o'z resurslari yuklanadi (tashqi telegram.org bundan mustasno) */
  // ERR_ABORTED — sahifadan sahifaga tez o'tganda bekor bo'lgan prefetch; nosozlik emas.
  const ownFailures = [
    ...new Set(
      failedRequests
        .filter((f) => !f.url.includes("telegram.org") && !f.error.includes("ERR_ABORTED"))
        .map((f) => `${f.url} (${f.error})`),
    ),
  ];
  check("Ilovaning o'z resurslari yuklanadi", ownFailures.length === 0, ownFailures.join(", "));
  if (failedRequests.some((f) => f.url.includes("telegram.org"))) {
    console.log(
      "\nEslatma: telegram.org/js/telegram-web-app.js sinov muhitida yuklanmadi " +
        "(tashqi tarmoq yopiq). Haqiqiy Telegram ichida u yuklanadi.",
    );
  }

  await browser.close();
}

console.log("\n=== O'TDI ===");
for (const line of ok) console.log(`  ✓ ${line}`);
if (fails.length) {
  console.log("\n=== XATO ===");
  for (const line of fails) console.log(`  ✗ ${line}`);
}
console.log(`\nNatija: ${ok.length} o'tdi, ${fails.length} xato`);
process.exit(fails.length ? 1 : 0);

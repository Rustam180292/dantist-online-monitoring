/**
 * Ota-ona qismini tekshiradi: Telegram kabineti va avtomatik eslatmalar.
 *
 * Ishga tushirish (server ishlab turgan holda):
 *   node tests/parent.mjs
 */
import { createHmac } from "node:crypto";
import playwright from "playwright";
import { all, closeDb, count, one } from "./db.mjs";
import "dotenv/config";

const { chromium } = playwright;
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

if (!BOT_TOKEN || !CRON_SECRET) {
  console.error("TELEGRAM_BOT_TOKEN va CRON_SECRET .env da bo'lishi kerak.");
  process.exit(1);
}


const ok = [];
const fails = [];
const check = (name, cond, extra = "") =>
  (cond ? ok : fails).push(`${name}${extra ? ` — ${extra}` : ""}`);

async function waitUntil(fn, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await fn()) return true;
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, 250));
  }
}

function makeInitData(user) {
  const p = new URLSearchParams();
  p.set("auth_date", String(Math.floor(Date.now() / 1000)));
  p.set("query_id", "AAE1");
  p.set("user", JSON.stringify(user));
  const check = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  p.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  return p.toString();
}

/* Rejadagi seansi bor bolaning ota-onasini tanlaymiz */
const target = await one(`
  SELECT u.id AS userId, u.phone, u.fullName, c.id AS clientId, c.fullName AS childName,
         s.id AS sessionId, s.startsAt
    FROM Session s
    JOIN Client c ON c.id = s.clientId
    JOIN User u ON u.id = c.parentUserId
   WHERE s.status = 'PLANNED' AND c.status = 'ACTIVE'
   ORDER BY s.startsAt ASC
   LIMIT 1
`);

if (!target) {
  console.error("Rejadagi seansi bor mijoz topilmadi — avval npm run db:reset qiling.");
  process.exit(1);
}

const PARENT_TG_ID = 910000001;

/* 1. Ota-onani Telegram'ga bog'laymiz */
{
  const res = await fetch(`${BASE}/api/tg/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(WEBHOOK_SECRET ? { "x-telegram-bot-api-secret-token": WEBHOOK_SECRET } : {}),
    },
    body: JSON.stringify({
      message: {
        chat: { id: PARENT_TG_ID },
        from: { id: PARENT_TG_ID },
        contact: { phone_number: target.phone, user_id: PARENT_TG_ID },
      },
    }),
  });
  const row = await one("SELECT telegramId FROM User WHERE id=?", target.userId);
  check(
    "Ota-ona Telegram'ga bog'landi",
    res.status === 200 && row.telegramId === String(PARENT_TG_ID),
    `telegramId=${row.telegramId}`,
  );
}

/* 2. Mini App sessiyasi */
const authRes = await fetch(`${BASE}/api/tg/auth`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ initData: makeInitData({ id: PARENT_TG_ID, first_name: "Ota" }) }),
});
const cookieMatch = (authRes.headers.get("set-cookie") ?? "").match(/logoped_session=([^;]+)/);
check("Ota-ona uchun sessiya ochildi", authRes.status === 200 && !!cookieMatch);

if (!cookieMatch) {
  report();
} else {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([
    {
      name: "logoped_session",
      value: cookieMatch[1],
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
    const t = m.text();
    if (t.includes("favicon") || t.includes("Failed to load resource") || t.trim() === "Event") return;
    fails.push(`Konsol xatosi @ ${page.url()}: ${t.split("\n")[0]}`);
  });

  /* 3. Kabinet ochiladi */
  await page.goto(`${BASE}/tg/app`);
  await page.waitForLoadState("networkidle");
  const body = await page.content();
  check(
    "Ota-ona kabineti ochiladi",
    body.includes(target.childName) && body.includes("Keyingi mashg"),
    page.url(),
  );
  {
    // Markazda abonement yo'q. textContent — yashirin bo'limlarni ham qamraydi
    const all = (await page.locator("main").textContent()) ?? "";
    check(
      "Kabinetda abonement, qolgan seans, qarzdorlik va to'lov turi yo'q",
      !/abonement/i.test(all) && !all.includes("Qolgan seans") && !all.includes("Qarzdorlik") &&
        !all.includes("To'lov turi") &&
        (await page.locator('button[data-tab="billing"]').count()) === 0,
    );
    check(
      "Farzandim'da o'tgan va rejadagi mashg'ulotlar soni",
      all.includes("Jami o'tgan mashg'ulot") && all.includes("Rejadagi mashg'ulot"),
    );
  }
  check(
    "Mutaxassisning puli ota-onaga ko'rinmaydi",
    !body.includes("Qolgan pulim") && !body.includes("Jami hisoblangan"),
  );

  /* 3b. Kabinet "Farzandim" bilan ochiladi; to'liq ko'rinish, parol, chiqish yo'q */
  {
    check(
      "Kabinet Farzandim bo'limi bilan ochiladi",
      (await page.locator('[data-testid="parent-child"]').count()) === 1 &&
        (await page.locator("main").innerText()).includes("Jami o'tgan mashg'ulot"),
    );
    const foot = await page.locator("footer").last().innerText();
    check(
      "Ota-onada To'liq ko'rinish, Parol, Chiqish va ilova o'rnatish yo'q",
      !foot.includes("To'liq ko'rinish") && !foot.includes("Parol") && !foot.includes("Chiqish") &&
        !foot.includes("O'rnatish"),
      foot.replace(/\n/g, " | "),
    );
    for (const path of ["/my", "/settings", "/"]) {
      await page.goto(`${BASE}${path}`);
      await page.waitForLoadState("networkidle");
      check(`Ota-ona ${path} dan kabinetga qaytariladi`, new URL(page.url()).pathname === "/m", page.url());
    }
  }

  /* 3c. Tun/kun rejimi Telegram mavzusidan qat'i nazar ishlaydi */
  {
    // Telegram o'z ranglarini --tg-theme-* bilan qo'yadi — shuni taqlid qilamiz
    const shellBg = async (theme) => {
      await ctx.addCookies([{ name: "theme", value: theme, domain: "localhost", path: "/" }]);
      await page.goto(`${BASE}/m`);
      await page.waitForLoadState("networkidle");
      return page.evaluate(() => {
        document.documentElement.style.setProperty("--tg-theme-bg-color", "#ffffff");
        document.documentElement.style.setProperty("--tg-theme-secondary-bg-color", "#ffffff");
        return [
          getComputedStyle(document.querySelector(".app-shell")).backgroundColor,
          getComputedStyle(document.querySelector(".app-card")).backgroundColor,
        ].join(" ");
      });
    };
    const dark = await shellBg("dark");
    const light = await shellBg("light");
    check(
      "Mini App'da tungi va kunduzgi rejim almashadi",
      dark.startsWith("rgb(2, 6, 23)") && light.startsWith("rgb(239, 251, 246)"),
      `${dark} / ${light}`,
    );
    await ctx.clearCookies({ name: "theme" });
  }

  /* 4. Bo'limlar ishlaydi */
  for (const [tab, marker] of [
    ["history", "Davomat"],
    ["payments", "To'lovlar"],
  ]) {
    await page.goto(`${BASE}/tg/app?tab=${tab}`);
    await page.waitForLoadState("networkidle");
    check(`"${marker}" bo'limi ochiladi`, (await page.content()).includes(marker));
  }

  /* 4b. Bo'limlar serverga bormasdan, darhol almashadi */
  {
    await page.goto(`${BASE}/m`);
    await page.waitForLoadState("networkidle");
    // Sahifa qayta yuklansa bu belgi yo'qoladi (replaceState esa saqlaydi)
    await page.evaluate(() => { window.__sameDoc = true; });
    await page.click('button[data-tab="payments"]');
    const visible = await page.locator("main").innerText();
    const navigated = !(await page.evaluate(() => window.__sameDoc === true));
    check(
      "Bo'lim sahifa yuklanmasdan almashadi",
      !navigated && visible.includes("To'lovlar") &&
        (visible.includes("Jami to'langan") || visible.includes("Hali to'lov qilinmagan")) &&
        !visible.includes("Jami o'tgan mashg'ulot") &&
        new URL(page.url()).searchParams.get("tab") === "payments",
      page.url(),
    );
  }

  /* 5. Ota-ona boshqa bolani ko'ra olmaydi */
  {
    const other = await one(
      "SELECT id, fullName FROM Client WHERE parentUserId <> ? AND parentUserId IS NOT NULL LIMIT 1",
      target.userId,
    );
    await page.goto(`${BASE}/tg/app?child=${other.id}`);
    await page.waitForLoadState("networkidle");
    const b = await page.content();
    check(
      "Begona bolaning ma'lumoti ko'rinmaydi",
      !b.includes(other.fullName) && b.includes(target.childName),
      other.fullName,
    );
  }

  /* 5b. Eski abonementi qarzdor yoki tugayotgan ota-onalarni ham ulaymiz —
       markazda abonement yo'q, ularga bunday eslatma bormasligi sinaladi */
  const linkParent = async (phone, tgId) =>
    fetch(`${BASE}/api/tg/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(WEBHOOK_SECRET ? { "x-telegram-bot-api-secret-token": WEBHOOK_SECRET } : {}),
      },
      body: JSON.stringify({
        message: {
          chat: { id: tgId },
          from: { id: tgId },
          contact: { phone_number: phone, user_id: tgId },
        },
      }),
    });

  const debtor = await one(`
    SELECT u.phone AS phone
      FROM Package p
      JOIN Client c ON c.id = p.clientId
      JOIN User u ON u.id = c.parentUserId
     WHERE p.isActive = true AND c.status = 'ACTIVE'
       AND (p.totalSessions * p.pricePerSession) >
           COALESCE((SELECT SUM(amount) FROM Payment WHERE packageId = p.id), 0)
     LIMIT 1
  `);

  const lowPackage = await one(`
    SELECT u.phone AS phone
      FROM Package p
      JOIN Client c ON c.id = p.clientId
      JOIN User u ON u.id = c.parentUserId
     WHERE p.isActive = true AND c.status = 'ACTIVE'
       AND p.totalSessions -
           (SELECT COUNT(*) FROM Session s
             WHERE s.packageId = p.id AND s.status IN ('DONE','NO_SHOW')) <= 2
     LIMIT 1
  `);

  if (debtor) await linkParent(debtor.phone, 910000002);
  if (lowPackage) await linkParent(lowPackage.phone, 910000003);

  /* 6. Eslatmalar: maxfiy so'zsiz ishlamaydi */
  {
    const res = await fetch(`${BASE}/api/tg/notify`, { method: "POST" });
    check("Eslatma endpoint'i himoyalangan", res.status === 403, `status ${res.status}`);
  }

  /* 7. Eslatmalar navbatga qo'yiladi */
  const before = await count("SELECT COUNT(*) AS n FROM Notification");
  // Seed'da eski PACKAGE_LOW/DEBT yozuvlari bo'lishi mumkin — faqat shu
  // yurishda yozilganlarga qaraymiz (baza vaqti UTC, zonasiz)
  const runStart = new Date(Date.now() - 2000).toISOString().replace("Z", "");
  // Ertangi mashg'ulot eslatmasi — endi yagona muntazam eslatma. Seed'da
  // ulangan ota-onaning ertaga mashg'uloti bo'lmasligi mumkin, shuning uchun
  // bittasini yozib qo'yamiz (baza vaqti UTC, zonasiz)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  const reminderSessionId = `remtest${Date.now()}`;
  await all(
    `INSERT INTO Session (id, clientId, specialistId, branchId, sessionTypeId, startsAt, durationMin, status, price)
     SELECT ?, clientId, specialistId, branchId, sessionTypeId, ?, durationMin, 'PLANNED', 0
       FROM Session WHERE id = ?`,
    reminderSessionId,
    tomorrow.toISOString().replace("Z", ""),
    target.sessionId,
  );
  let firstRun;
  {
    const res = await fetch(`${BASE}/api/tg/notify`, {
      method: "POST",
      headers: { "x-cron-secret": CRON_SECRET },
    });
    firstRun = await res.json();
    const after = await count("SELECT COUNT(*) AS n FROM Notification");
    check(
      "Eslatmalar navbatga qo'yildi",
      res.status === 200 && after > before,
      `${before} -> ${after}`,
    );

    const kinds = (
      await all("SELECT DISTINCT kind AS k FROM Notification WHERE createdAt >= ?", runStart)
    ).map((r) => r.k);
    check(
      "Eslatma turlari to'g'ri",
      kinds.every((k) => ["SESSION_REMINDER", "SESSION_DONE", "PARENT_CANCEL"].includes(k)),
      kinds.join(", "),
    );
    // Eski abonementi qarzdor yoki tugayotgan ota-ona ham ulangan, lekin
    // markazda abonement yo'q — ularga bunday eslatma bormasligi kerak
    check(
      "Abonement va qarzdorlik eslatmasi yuborilmaydi",
      Boolean(debtor || lowPackage) && !kinds.includes("DEBT") && !kinds.includes("PACKAGE_LOW"),
      kinds.join(", "),
    );
  }

  /* 8. Ikkinchi yurishda takrorlanmaydi */
  {
    const beforeSecond = await count("SELECT COUNT(*) AS n FROM Notification");
    const res = await fetch(`${BASE}/api/tg/notify`, {
      method: "POST",
      headers: { "x-cron-secret": CRON_SECRET },
    });
    const second = await res.json();
    const afterSecond = await count("SELECT COUNT(*) AS n FROM Notification");
    check(
      "Bir xil eslatma ikki marta yozilmaydi",
      afterSecond === beforeSecond,
      `${beforeSecond} -> ${afterSecond} (navbatga: ${JSON.stringify(second.queued)})`,
    );
  }

  await all("DELETE FROM Session WHERE id = ?", reminderSessionId);

  /* 9. Yuborilmagan xabar qayta urinish uchun qoladi */
  {
    const pending = await one(
      "SELECT attempts, error, sentAt FROM Notification ORDER BY createdAt DESC LIMIT 1",
    );
    check(
      "Yuborilmagan xabar navbatda qoladi",
      pending.sentAt === null && pending.attempts >= 1 && !!pending.error,
      `attempts=${pending.attempts} error=${pending.error}`,
    );
  }

  /* 10. Xabar matni bolaning ismi bilan */
  {
    // Qaysi bolaga xabar ketgani ma'lumotga bog'liq, shuning uchun eng oxirgi
    // xabarni olib, uning matnida o'sha bolaning ismi borligini tekshiramiz.
    const row = await one(`
      SELECT n.text AS text, c.fullName AS clientName
        FROM Notification n
        JOIN Client c ON c.id = n.clientId
       ORDER BY n.createdAt DESC
       LIMIT 1`);
    check(
      "Xabar matni mazmunli",
      !!row && row.text.includes(row.clientName),
      row ? row.text.split("\n")[0] : "xabar yo'q",
    );
  }

  /* 11. Mashg'ulot "o'tdi" belgilansa — ota-onaga xabar ketadi */
  {
    const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const admin = await adminCtx.newPage();
    await admin.goto(`${BASE}/login`);
    await admin.fill("#phone", "+998901234567");
    await admin.fill("#password", "parol123");
    await admin.click("button[type=submit]");
    await admin.waitForLoadState("networkidle");

    // Seans qaysi haftada ekanini hisoblaymiz
    const mondayOf = (d) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
      return x;
    };
    const thisMonday = mondayOf(new Date());
    const sessionMonday = mondayOf(new Date(target.startsAt));
    const offset = Math.round((sessionMonday - thisMonday) / (7 * 86400000));

    await admin.goto(`${BASE}/schedule?w=${offset}`);
    await admin.waitForLoadState("networkidle");

    // Shu bolaning aynan rejadagi (O'tdi tugmasi bor) seansini topamiz
    const row = admin
      .locator("li")
      .filter({ hasText: target.childName })
      .filter({ has: admin.locator('form button:has-text("O\'tdi")') })
      .first();
    const btn = row.locator('form button:has-text("O\'tdi")').first();

    if (await btn.count()) {
      await btn.click();
      const notified = await waitUntil(
        async () =>
          await count("SELECT COUNT(*) AS n FROM Notification WHERE kind='SESSION_DONE'") > 0,
      );
      check("Mashg'ulot o'tgani haqida xabar yoziladi", notified);
    } else {
      check("Mashg'ulot o'tgani haqida xabar yoziladi", false, "seans topilmadi");
    }
    await adminCtx.close();
  }

  /* 12. To'lovlar tarixi */
  {
    const paid = await count("SELECT COUNT(*) AS n FROM Payment WHERE clientId = ?", target.clientId);
    await page.goto(`${BASE}/tg/app?tab=payments`);
    await page.waitForLoadState("networkidle");
    const shown = await page.locator('[data-testid="parent-payment"]').count();
    const main = await page.locator("main").innerText();
    check(
      "To'lovlar tarixi ko'rinadi",
      shown === Math.min(paid, 50) && (paid === 0 ? main.includes("Hali to'lov qilinmagan") : main.includes("Jami to'langan")),
      `${shown} / ${paid}`,
    );

    // Hisob-kitob: jami to'langan, seanslar uchun va qoldiq — bazadagi bilan teng
    const paidSum = await count("SELECT COALESCE(SUM(amount), 0) AS n FROM Payment WHERE clientId = ?", target.clientId);
    const earnedSum = await count(
      "SELECT COALESCE(SUM(price), 0) AS n FROM Session WHERE clientId = ? AND status IN ('DONE','NO_SHOW')",
      target.clientId,
    );
    const fmt = (n) => `${String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} so'm`;
    const box = (await page.locator('[data-testid="parent-balance"]').innerText()).replace(/\s/g, " ");
    const bal = paidSum - earnedSum;
    check(
      "Ota-ona jami to'lovi, seanslar uchun va qoldiqni ko'radi",
      box.includes(`Jami to'langan ${fmt(paidSum)}`) &&
        box.includes(`Seanslar uchun ${fmt(earnedSum)}`) &&
        box.includes(`Qoldiq ${bal > 0 ? "+" : bal < 0 ? "−" : ""}${fmt(bal)}`),
      `${box} | ${paidSum} ${earnedSum}`,
    );
    await page.goto(`${BASE}/tg/app`);
    await page.waitForLoadState("networkidle");
    check(
      "Farzandim bo'limida qoldiq ko'rinadi",
      (await page.locator('[data-testid="parent-balance-short"]').innerText()).replace(/\s/g, " ").endsWith(fmt(bal)),
    );
  }

  /* 13. Mutaxassislar va qo'ng'iroq */
  let specialistUser;
  {
    const team = await all(
      `SELECT s.id, u.id AS userId, u.phone FROM Assignment a
         JOIN Specialist s ON s.id = a.specialistId JOIN User u ON u.id = s.userId
        WHERE a.clientId = ? AND s.isActive = true`,
      target.clientId,
    );
    specialistUser = team[0];
    await page.goto(`${BASE}/tg/app?tab=team`);
    await page.waitForLoadState("networkidle");
    const cards = page.locator('[data-testid="parent-specialist"]');
    const tels = await cards.locator('a[href^="tel:"]').evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    check(
      "Biriktirilgan mutaxassislar qo'ng'iroq tugmasi bilan ko'rinadi",
      team.length > 0 && (await cards.count()) === team.length && team.every((m) => tels.includes(`tel:${m.phone}`)),
      `${await cards.count()} / ${team.length}`,
    );
  }

  /* 14. Ota-ona mashg'ulotni bekor qiladi */
  if (specialistUser) {
    const sp = await one("SELECT branchId FROM Specialist WHERE id = ?", specialistUser.id);
    const later = `tst-bekor-${Date.now()}`;
    const soon = `tst-yaqin-${Date.now()}`;
    const ins = (id, hours) =>
      all(
        `INSERT INTO Session (id, clientId, specialistId, branchId, startsAt, durationMin, status, price, createdAt)
         VALUES (?, ?, ?, ?, now() AT TIME ZONE 'UTC' + (? || ' hours')::interval, 45, 'PLANNED', 0, now())`,
        id, target.clientId, specialistUser.id, sp.branchId, String(hours),
      );
    await ins(later, 72);
    await ins(soon, 1);
    // Xodimga xabar borishi uchun mutaxassisni vaqtincha Telegram'ga bog'laymiz
    const prevTg = (await one("SELECT telegramId FROM User WHERE id = ?", specialistUser.userId)).telegramId;
    if (!prevTg) await all("UPDATE User SET telegramId = '910000077' WHERE id = ?", specialistUser.userId);

    await page.goto(`${BASE}/tg/app?tab=schedule`);
    await page.waitForLoadState("networkidle");
    const cardOf = (id) => page.locator(`[data-testid="parent-session"]:has(input[name="sessionId"][value="${id}"])`);
    check(
      "Yaqin mashg'ulotni ota-ona bekor qila olmaydi",
      (await cardOf(soon).count()) === 0 &&
        (await page.locator("main").innerText()).includes("markazga qo'ng'iroq qiling"),
    );

    const card = cardOf(later);
    if (await card.count()) {
      await card.locator("summary").click();
      await card.locator('input[name="reason"]').fill("Kasal");
      await card.locator('button[type="submit"]').click();
      const cancelled = await waitUntil(
        async () => (await one("SELECT status FROM Session WHERE id = ?", later))?.status === "CANCELLED_CLIENT",
      );
      const row = await one("SELECT note, price FROM Session WHERE id = ?", later);
      check(
        "Ota-ona mashg'ulotni bekor qila oladi",
        cancelled && row.note.includes("Kasal") && Number(row.price) === 0,
        JSON.stringify(row),
      );
      check(
        "Bekor qilingani mutaxassisga xabar qilinadi",
        await waitUntil(
          async () => (await count(
            "SELECT COUNT(*) AS n FROM Notification WHERE kind = 'PARENT_CANCEL' AND userId = ?",
            specialistUser.userId,
          )) > 0,
        ),
      );
    } else {
      check("Ota-ona mashg'ulotni bekor qila oladi", false, "bekor qilish tugmasi yo'q");
    }

    if (!prevTg) await all("UPDATE User SET telegramId = NULL WHERE id = ?", specialistUser.userId);
    await all("DELETE FROM Notification WHERE kind = 'PARENT_CANCEL' AND clientId = ?", target.clientId);
    await all("DELETE FROM Session WHERE id IN (?, ?)", later, soon);
  }

  /* 15. Yakka logopedning mijozi: kabinetda markaz emas, logopedning o'z nomi */
  {
    const tag = Date.now().toString().slice(-6);
    const branchId = `ysolo${tag}`;
    const clientId = `ykid${tag}`;
    const phone = `+99890555${tag.slice(-4)}`;
    const tgId = 920000000 + Number(tag.slice(-4));
    await all(
      `INSERT INTO Branch (id, name, isSolo, brandName, phone) VALUES (?, ?, true, 'Nutq Test', '+998901112233')`,
      branchId, `Sinov Logoped (yakka) ${tag}`,
    );
    await all(
      `INSERT INTO Client (id, fullName, birthDate, branchId, parentName, parentPhone, status, billingType)
       VALUES (?, ?, '2020-03-03', ?, 'Yakka Ota', ?, 'ACTIVE', 'DAILY')`,
      clientId, `Yakka Farzand ${tag}`, branchId, phone,
    );
    // Kanal tugmasi -> bot -> raqam: ota-ona akkaunti mijoz kartasidagi raqamdan ochiladi
    await fetch(`${BASE}/api/tg/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(WEBHOOK_SECRET ? { "x-telegram-bot-api-secret-token": WEBHOOK_SECRET } : {}),
      },
      body: JSON.stringify({
        message: { chat: { id: tgId }, from: { id: tgId }, contact: { phone_number: phone, user_id: tgId } },
      }),
    });
    const res = await fetch(`${BASE}/api/tg/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: makeInitData({ id: tgId, first_name: "Yakka" }) }),
    });
    const m = (res.headers.get("set-cookie") ?? "").match(/logoped_session=([^;]+)/);
    let header = "";
    let footer = "";
    if (m) {
      const c2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await c2.addCookies([{ name: "logoped_session", value: m[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
      const p2 = await c2.newPage();
      await p2.goto(`${BASE}/m`);
      await p2.waitForLoadState("networkidle");
      header = await p2.locator('[data-testid="parent-provider"]').innerText().catch(() => "");
      footer = await p2.locator("main footer").first().innerText().catch(() => "");
      await c2.close();
    }
    check(
      "Yakka logoped mijozining ota-onasi Telegram orqali kabinetga kiradi",
      Boolean(m) && header.length > 0,
      `${res.status}`,
    );
    check(
      "Kabinetda yakka logopedning o'z nomi ko'rinadi, \"(yakka)\" emas",
      header.includes("Nutq Test") && footer.includes("Nutq Test") && !header.includes("(yakka)") &&
        footer.includes("+998901112233"),
      `${header} | ${footer.replace(/\n/g, " ")}`,
    );
    const pu = await one("SELECT id FROM User WHERE phone = ?", phone);
    await all("DELETE FROM Client WHERE id = ?", clientId);
    if (pu) await all("DELETE FROM User WHERE id = ?", pu.id);
    await all("DELETE FROM Branch WHERE id = ?", branchId);
  }

  const ownFailures = [
    ...new Set(
      failedRequests
        .filter((f) => !f.url.includes("telegram.org") && !f.error.includes("ERR_ABORTED"))
        .map((f) => `${f.url} (${f.error})`),
    ),
  ];
  check("Ilovaning o'z resurslari yuklanadi", ownFailures.length === 0, ownFailures.join(", "));

  await browser.close();
  report();
}

function report() {
  closeDb();

console.log("\n=== O'TDI ===");
  for (const line of ok) console.log(`  ✓ ${line}`);
  if (fails.length) {
    console.log("\n=== XATO ===");
    for (const line of fails) console.log(`  ✗ ${line}`);
  }
  console.log(`\nNatija: ${ok.length} o'tdi, ${fails.length} xato`);
  process.exit(fails.length ? 1 : 0);
}

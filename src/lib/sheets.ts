import "server-only";
import { prisma } from "@/lib/prisma";
import {
  BILLABLE_STATUSES,
  CLIENT_STATUSES,
  INTAKE_RESULTS,
  INTAKE_STATUSES,
  PAYMENT_METHODS,
  ROLES,
  SESSION_STATUSES,
  SPECIALIZATIONS,
} from "@/lib/constants";
import { timeUz, toDateInput } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";

/**
 * Google Sheets zaxirasi.
 *
 * Jadvalga foydalanuvchi o'zi tayyor Apps Script qo'yadi va uning manzilini
 * Sozlamalarga yozadi. Biz shu manzilga hamma ma'lumotni varaqlar bo'yicha
 * yuboramiz, skript har bir varaqni tozalab qaytadan yozadi. Nega shunday:
 * Google Cloud loyihasi, xizmat akkaunti va kalitlar kerak emas — markaz
 * egasi buni o'zi 5 daqiqada sozlaydi, Vercel'ga hech narsa yozilmaydi.
 *
 * Jadval — odam o'qiydigan nusxa: id'lar o'rniga ismlar, holatlar
 * o'zbekcha. Parol, Telegram id kabi narsalar yuborilmaydi.
 */

type Cell = string | number;
type Sheet = Cell[][];

/** Apps Script "Web app" manzili: faqat shu ko'rinishdagi manzil qabul qilinadi */
export const SHEETS_URL_RE = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;

/**
 * Jadvalga qo'yiladigan skript. Sozlamalarda ko'rsatiladi — foydalanuvchi
 * nusxalab Apps Script'ga qo'yadi.
 */
export const APPS_SCRIPT = `function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(data.sheets).forEach(function (name) {
    var rows = data.sheets[name];
    var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    sheet.clearContents();
    if (rows.length > 0) {
      sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
      sheet.setFrozenRows(1);
    }
  });
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}`;

/**
 * Jadval "=", "+", "-", "@" bilan boshlangan matnni formula deb tushunadi:
 * ota-onaning ismi formulaga aylanib qolmasin, "+998..." telefon esa raqamga
 * aylanib "+" yo'qolmasin. Oldiga "'" qo'yilsa jadval uni oddiy matn deb
 * oladi (o'zi ko'rinmaydi).
 */
function cell(v: string | number | null | undefined): Cell {
  if (v == null) return "";
  if (typeof v === "number") return v;
  return /^[=+\-@]/.test(v) ? `'${v}` : v;
}

const day = (d: Date | null) => (d ? toDateInput(d) : "");
const when = (d: Date | null) => (d ? `${toDateInput(d)} ${timeUz(d)}` : "");
const label = (map: Record<string, string>, key: string) => map[key] ?? key;

/**
 * Yuboriladigan varaqlar.
 *
 * `soloBranchId` berilsa — faqat shu yakka logopedning ma'lumoti. Berilmasa —
 * markazniki: yakka logopedlarniki ataylab kirmaydi, ular markazga
 * tegishli emas (har biri o'z jadvaliga yozadi).
 */
export async function buildSheets(soloBranchId: string | null): Promise<Record<string, Sheet>> {
  const branch = soloBranchId ? { branchId: soloBranchId } : { branch: { isSolo: false } };

  const [clients, sessions, payments, intakes, staff, services, payouts, paidRows, earnedRows] = await Promise.all([
    prisma.client.findMany({
      where: branch,
      orderBy: { fullName: "asc" },
      include: {
        branch: { select: { name: true } },
        specialists: { include: { specialist: { select: { user: { select: { fullName: true } } } } } },
        services: { include: { sessionType: { select: { name: true } } } },
      },
    }),
    prisma.session.findMany({
      where: branch,
      orderBy: { startsAt: "desc" },
      include: {
        client: { select: { fullName: true } },
        specialist: { select: { user: { select: { fullName: true } } } },
        sessionType: { select: { name: true } },
        branch: { select: { name: true } },
      },
    }),
    prisma.payment.findMany({
      where: branch,
      orderBy: { paidAt: "desc" },
      include: { client: { select: { fullName: true } }, branch: { select: { name: true } } },
    }),
    prisma.intake.findMany({
      where: branch,
      orderBy: { scheduledAt: "desc" },
      include: {
        branch: { select: { name: true } },
        specialist: { select: { user: { select: { fullName: true } } } },
      },
    }),
    // Xodimlar — faqat markazda (yakka logopedning o'zidan boshqa xodimi yo'q)
    soloBranchId
      ? Promise.resolve([])
      : prisma.user.findMany({
          where: {
            role: { in: ["OWNER", "BRANCH_ADMIN", "RECEPTION", "SPECIALIST"] },
            OR: [{ branchId: null }, { branch: { isSolo: false } }],
          },
          orderBy: [{ role: "asc" }, { fullName: "asc" }],
          select: {
            fullName: true,
            phone: true,
            role: true,
            isActive: true,
            branch: { select: { name: true } },
            specialist: { select: { specialization: true } },
          },
        }),
    prisma.sessionType.findMany({
      where: soloBranchId ? { branchId: soloBranchId } : { branchId: null },
      orderBy: { name: "asc" },
    }),
    soloBranchId
      ? Promise.resolve([])
      : prisma.salaryPayout.findMany({
          where: { branch: { isSolo: false } },
          orderBy: { paidAt: "desc" },
          include: {
            specialist: { select: { user: { select: { fullName: true } } } },
            branch: { select: { name: true } },
          },
        }),
    // Mijozlar varag'idagi pul — Mijozlar sahifasidagi bilan bir xil hisob
    prisma.payment.groupBy({ by: ["clientId"], where: branch, _sum: { amount: true } }),
    prisma.session.groupBy({
      by: ["clientId"],
      where: { ...branch, status: { in: BILLABLE_STATUSES } },
      _sum: { price: true },
    }),
  ]);
  const paidBy = new Map(paidRows.map((r) => [r.clientId, r._sum.amount ?? 0]));
  const earnedBy = new Map(earnedRows.map((r) => [r.clientId, r._sum.price ?? 0]));

  const sheets: Record<string, Sheet> = {
    Mijozlar: [
      [
        "Bola", "Tug'ilgan sana", "Jinsi", "Filial", "Ota-ona", "Telefon",
        "Mutaxassis", "Xizmat", "Tashxis", "Izoh", "Holat",
        "To'langan", "Xizmatlar uchun", "Qoldiq", "Qo'shilgan",
      ],
      ...clients.map((c) => [
        cell(c.fullName),
        day(c.birthDate),
        c.gender === "M" ? "O'g'il" : c.gender === "F" ? "Qiz" : "",
        cell(c.branch.name),
        cell(c.parentName),
        cell(c.parentPhone),
        cell(c.specialists.map((a) => a.specialist.user.fullName).join(", ")),
        cell(c.services.map((x) => x.sessionType.name).join(", ")),
        cell(c.diagnosis),
        cell(c.note),
        label(CLIENT_STATUSES, c.status),
        paidBy.get(c.id) ?? 0,
        earnedBy.get(c.id) ?? 0,
        // Musbat — oldindan to'langan, manfiy — qarz
        (paidBy.get(c.id) ?? 0) - (earnedBy.get(c.id) ?? 0),
        day(c.createdAt),
      ]),
    ],
    Seanslar: [
      ["Vaqt", "Mijoz", "Mutaxassis", "Xizmat", "Filial", "Daqiqa", "Holat", "Narx", "Ulush %", "Izoh"],
      ...sessions.map((s) => [
        when(s.startsAt),
        cell(s.client.fullName),
        cell(s.specialist.user.fullName),
        cell(s.sessionType?.name),
        cell(s.branch.name),
        s.durationMin,
        label(SESSION_STATUSES, s.status),
        s.price,
        s.salaryPercent ?? "",
        cell(s.note),
      ]),
    ],
    "To'lovlar": [
      ["Sana", "Mijoz", "Filial", "Summa", "Usul", "Izoh"],
      ...payments.map((p) => [
        day(p.paidAt),
        cell(p.client.fullName),
        cell(p.branch.name),
        p.amount,
        label(PAYMENT_METHODS, p.method),
        cell(p.note),
      ]),
    ],
    Qabullar: [
      [
        "Vaqt", "Bola", "Tug'ilgan sana", "Ota-ona", "Telefon", "Filial", "Kim ko'rdi",
        "Holat", "Natija", "Narx", "To'langan", "Usul", "Izoh",
      ],
      ...intakes.map((i) => [
        when(i.scheduledAt),
        cell(i.childName),
        day(i.birthDate),
        cell(i.parentName),
        cell(i.parentPhone),
        cell(i.branch.name),
        cell(i.specialist?.user.fullName),
        label(INTAKE_STATUSES, i.status),
        label(INTAKE_RESULTS, i.result),
        i.price,
        day(i.paidAt),
        i.paidAt ? label(PAYMENT_METHODS, i.method) : "",
        cell(i.note),
      ]),
    ],
    Xizmatlar: [
      soloBranchId ? ["Xizmat", "Narx", "Faol"] : ["Xizmat", "Narx", "Mutaxassis ulushi %", "Faol"],
      ...services.map((x) =>
        soloBranchId
          ? [cell(x.name), x.price, x.isActive ? "ha" : "yo'q"]
          : [cell(x.name), x.price, x.salaryPercent, x.isActive ? "ha" : "yo'q"],
      ),
    ],
  };

  if (!soloBranchId) {
    sheets.Xodimlar = [
      ["Ism", "Telefon", "Rol", "Yo'nalish", "Filial", "Faol"],
      ...staff.map((u) => [
        cell(u.fullName),
        cell(u.phone),
        label(ROLES, u.role),
        u.specialist ? label(SPECIALIZATIONS, u.specialist.specialization) : "",
        cell(u.branch?.name ?? "Barcha filiallar"),
        u.isActive ? "ha" : "yo'q",
      ]),
    ];
    sheets["Ish haqi"] = [
      ["Sana", "Mutaxassis", "Filial", "Summa", "Usul", "Izoh"],
      ...payouts.map((p) => [
        day(p.paidAt),
        cell(p.specialist.user.fullName),
        cell(p.branch.name),
        p.amount,
        label(PAYMENT_METHODS, p.method),
        cell(p.note),
      ]),
    ];
  }

  sheets.Zaxira = [
    ["Oxirgi yozilgan", "Mijozlar", "Seanslar", "To'lovlar", "Qabullar"],
    [when(new Date()), clients.length, sessions.length, payments.length, intakes.length],
  ];

  return sheets;
}

/** Jadvalga yuborish. Xato bo'lsa — odamga tushunarli sabab bilan Error */
async function push(url: string, sheets: Record<string, Sheet>): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheets }),
      // Apps Script javobni boshqa manzilga yo'naltirib beradi
      redirect: "follow",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new Error("Google jadvalga ulanib bo'lmadi.");
  }
  const text = await res.text().catch(() => "");
  let ok = false;
  try {
    ok = res.ok && JSON.parse(text)?.ok === true;
  } catch {
    ok = false;
  }
  if (!ok) {
    // Ruxsat berilmagan skript JSON o'rniga Google'ning kirish sahifasini qaytaradi
    throw new Error(
      "Google jadval javob bermadi. Skript \"Web app\" qilib, \"Anyone\" ruxsati bilan joylanganini tekshiring.",
    );
  }
}

/**
 * Markaz (`soloBranchId` = null) yoki yakka logoped uchun zaxira yozadi va
 * natijasini (vaqt yoki xato sababi) bazaga belgilaydi — Sozlamalarda
 * ko'rinib turadi, jim buzilib yotmasin.
 */
export async function syncSheets(soloBranchId: string | null): Promise<{ ok: boolean; error?: string }> {
  const target = soloBranchId
    ? await prisma.branch.findFirst({ where: { id: soloBranchId, isSolo: true }, select: { sheetsUrl: true } })
    : await prisma.settings.findUnique({ where: { id: "main" }, select: { sheetsUrl: true } });
  if (!target?.sheetsUrl) return { ok: false, error: "Google jadval manzili kiritilmagan." };

  const mark = (data: { sheetsSyncedAt?: Date; sheetsError: string | null }) =>
    soloBranchId
      ? prisma.branch.update({ where: { id: soloBranchId }, data })
      : prisma.settings.update({ where: { id: "main" }, data });

  try {
    await push(target.sheetsUrl, await buildSheets(soloBranchId));
    await mark({ sheetsSyncedAt: new Date(), sheetsError: null });
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await mark({ sheetsError: error });
    return { ok: false, error };
  }
}

/**
 * Kunlik zaxira: markaz va jadval ulagan har bir yakka logoped.
 *
 * Cron'lar kuniga bir yoki bir necha marta chaqirishi mumkin — oxirgi
 * muvaffaqiyatli yozuvdan 20 soat o'tmagan bo'lsa qayta yozilmaydi.
 */
export async function runDailySheets(now: Date = new Date()): Promise<number> {
  const due = new Date(now.getTime() - 20 * 3_600_000);
  const stale = { OR: [{ sheetsSyncedAt: null }, { sheetsSyncedAt: { lt: due } }] };

  const [center, solos] = await Promise.all([
    prisma.settings.findFirst({ where: { id: "main", sheetsUrl: { not: null }, ...stale }, select: { id: true } }),
    prisma.branch.findMany({ where: { isSolo: true, sheetsUrl: { not: null }, ...stale }, select: { id: true } }),
  ]);

  let done = 0;
  if (center && (await syncSheets(null)).ok) done++;
  // Ketma-ket: bir vaqtda o'nlab jadvalga yozish bazani ham, Google'ni ham bosadi
  for (const b of solos) {
    if ((await syncSheets(b.id)).ok) done++;
  }
  return done;
}

/* ---------- Har o'zgarishdan keyin ---------- */

const LOCK_STALE_MS = 2 * 60_000;

type Target = { solo: string | null };

async function setFields(t: Target, data: { sheetsDirtyAt?: Date; sheetsLockAt?: Date | null }) {
  return t.solo
    ? prisma.branch.updateMany({ where: { id: t.solo, isSolo: true }, data })
    : prisma.settings.updateMany({ where: { id: "main" }, data });
}

/** Faqat bitta yozuvchi: band bo'lmasa (yoki egasi 2 daqiqadan beri qotib qolgan bo'lsa) olamiz */
async function tryLock(t: Target): Promise<boolean> {
  const now = new Date();
  const free = { OR: [{ sheetsLockAt: null }, { sheetsLockAt: { lt: new Date(now.getTime() - LOCK_STALE_MS) } }] };
  const res = t.solo
    ? await prisma.branch.updateMany({ where: { id: t.solo, isSolo: true, sheetsUrl: { not: null }, ...free }, data: { sheetsLockAt: now } })
    : await prisma.settings.updateMany({ where: { id: "main", sheetsUrl: { not: null }, ...free }, data: { sheetsLockAt: now } });
  return res.count === 1;
}

async function dirtySince(t: Target, since: Date): Promise<boolean> {
  const row = t.solo
    ? await prisma.branch.findUnique({ where: { id: t.solo }, select: { sheetsDirtyAt: true } })
    : await prisma.settings.findUnique({ where: { id: "main" }, select: { sheetsDirtyAt: true } });
  return Boolean(row?.sheetsDirtyAt && row.sheetsDirtyAt > since);
}

/**
 * Ma'lumot o'zgardi — jadvalni yangilaymiz.
 *
 * Bir necha o'zgarish ketma-ket kelsa (to'lov, keyin seans), har biri
 * alohida yozuv boshlasa, sekinroq ketgan eski nusxa yangisining ustidan
 * yozib qo'yishi mumkin edi. Shuning uchun: o'zgarish "belgi" qo'yadi,
 * yozishni esa faqat qulfni olgan bitta jarayon qiladi va belgi yangilanib
 * turgan ekan, qaytadan yozadi. Qulfni ololmagan jarayon belgini qo'yib
 * ketadi — ish egasi uni ko'radi.
 */
export async function sheetsChanged(solo: string | null): Promise<void> {
  const t: Target = { solo };
  await setFields(t, { sheetsDirtyAt: new Date() });

  for (let round = 0; round < 5; round++) {
    if (!(await tryLock(t))) return;
    let again = false;
    // Oxirgi marta qaysi lahzadan keyingi o'zgarishni qidirganimiz. Qulf
    // bo'shagandan keyingi tekshiruv ham shunga qaraydi: "oxirgi bir soniya"
    // deb qaralsa, yozuv tez tugaganda o'zimiz qo'ygan belgini ko'rib,
    // o'zgarish bo'lmasa ham qaytadan yozib yurardi.
    let since = new Date();
    try {
      // Belgi shu lahzadan keyin qo'yilsa — yana bir marta yozamiz
      await syncSheets(solo);
      again = await dirtySince(t, since);
      while (again && round < 4) {
        round++;
        since = new Date();
        await syncSheets(solo);
        again = await dirtySince(t, since);
      }
    } finally {
      await setFields(t, { sheetsLockAt: null });
    }
    // Qulf bo'shagandan keyin yana tekshiramiz: o'sha orada kelgan va qulfni
    // ololmagan o'zgarish yo'qolib qolmasin
    if (!again && !(await dirtySince(t, since))) return;
  }
}

/**
 * Server action'dan keyin (`withFlash`): kim o'zgartirgan bo'lsa, o'sha
 * jadval yangilanadi — yakka logoped yoki uning mijozi bo'lsa o'zinikida,
 * qolganlari markaznikida. Jadval ulanmagan bo'lsa hech narsa qilinmaydi.
 */
export async function syncAfterChange(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const solo = user.isSolo && user.branchId ? user.branchId : null;
  const configured = solo
    ? await prisma.branch.findFirst({ where: { id: solo, isSolo: true, sheetsUrl: { not: null } }, select: { id: true } })
    : await prisma.settings.findFirst({ where: { id: "main", sheetsUrl: { not: null } }, select: { id: true } });
  if (!configured) return;
  await sheetsChanged(solo);
}

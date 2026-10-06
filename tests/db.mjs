/**
 * Testlar uchun bazaga to'g'ridan-to'g'ri kichik ulanish.
 *
 * Ilovada nima bo'layotganini brauzerdan emas, bazadan tekshirish uchun kerak:
 * "tugma bosildi" emas, "yozuv haqiqatan paydo bo'ldi" degan javob olinadi.
 *
 * Ikki qulaylik:
 *  - Prisma jadval va ustun nomlarini katta-kichik harf bilan yaratadi
 *    ("User", "fullName"), PostgreSQL esa tirnoqsiz nomlarni kichik harfga
 *    tushiradi — shuning uchun ular avtomatik tirnoqqa olinadi;
 *  - parametrlar SQLite uslubidagi "?" bilan yozilaveradi, bu yerda ular
 *    PostgreSQL uslubidagi $1, $2 ga aylantiriladi.
 */
import "dotenv/config";
import pg from "pg";

const IDENTIFIERS = [
  // jadvallar
  "SalaryPayout", "Notification", "Assignment", "Specialist", "Payment",
  "Package", "Session", "Client", "Branch", "User", "LinkCode", "Intake",
  // ustunlar va taxalluslar
  "telegramUsername", "pricePerSession", "parentUserId", "totalSessions",
  "specialistId", "salaryPercent", "telegramId", "purchasedAt", "parentPhone",
  "clientName", "dedupeKey", "sessionId", "childName", "packageId", "birthDate",
  "createdAt", "startsAt", "clientId", "branchId", "fullName", "isActive",
  "scheduledAt", "createdById", "childName", "parentName",
  "userId", "paidAt", "sentAt",
].sort((a, b) => b.length - a.length);

const IDENT_RE = new RegExp(`\\b(${IDENTIFIERS.join("|")})\\b`, "g");

const quoteIdentifiers = (sql) => sql.replace(IDENT_RE, '"$1"');

const toPgPlaceholders = (sql) => {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
};

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL sozlanmagan — .env faylini tekshiring.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString, max: 3 });

export async function all(sql, ...params) {
  const result = await pool.query(toPgPlaceholders(quoteIdentifiers(sql)), params);
  return result.rows;
}

export async function one(sql, ...params) {
  const rows = await all(sql, ...params);
  return rows[0] ?? null;
}

/** "SELECT COUNT(*) AS n ..." ko'rinishidagi so'rov uchun */
export async function count(sql, ...params) {
  const row = await one(sql, ...params);
  return Number(row?.n ?? 0);
}

export async function closeDb() {
  await pool.end().catch(() => {});
}

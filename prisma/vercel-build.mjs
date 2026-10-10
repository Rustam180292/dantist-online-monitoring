/**
 * Vercel'dagi yig'ish: avval baza tuzilishini yangilaydi, keyin saytni yig'adi.
 *
 * Nega: yangi jadval yoki ustun qo'shilgan PR merge qilinib, `db:push`
 * unutilsa, sayt "Amal bajarilmadi" bilan yiqilardi (ikki marta bo'lgan).
 * Endi baza har chiqarishda o'zi yangilanadi.
 *
 * Xavfsizlik:
 *  - Faqat haqiqiy saytda (VERCEL_ENV=production). Preview (PR tarmoqlari)
 *    o'sha bazaga ulangan bo'lishi mumkin — hali merge qilinmagan tuzilish
 *    jonli bazaga tushmasligi kerak.
 *  - `--accept-data-loss` YO'Q. Yangilash biror ustun yoki jadvalni o'chirishni
 *    talab qilsa, Prisma rad etadi, yig'ish to'xtaydi va eski versiya ishlab
 *    turaveradi. Bunday o'zgarishni odam zaxira olib, qo'lda qiladi.
 *  - Baza yangilanmasa, sayt yig'ilmaydi: yangi kod eski bazada yiqilgandan
 *    ko'ra eski kod ishlab turgani yaxshi. Qo'shish (ustun, jadval) eski kodga
 *    zarar qilmaydi, shuning uchun baza oldin yangilanadi.
 *
 * O'chirib qo'yish (favqulodda): Vercel'da SKIP_DB_PUSH=1.
 */
import { spawnSync } from "node:child_process";

function run(cmd, args, env = process.env) {
  const r = spawnSync(cmd, args, { stdio: "inherit", env, shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

/**
 * `db push` uchun to'g'ridan-to'g'ri ulanish. Neon'ning "pooled" manzili
 * (xostida `-pooler`) jadval o'zgartirish buyruqlarini o'tkazmasligi mumkin.
 * Neon integratsiyasi DATABASE_URL_UNPOOLED ni o'zi qo'yadi; bo'lmasa
 * Neon qoidasi bo'yicha xostdan `-pooler` olib tashlanadi.
 */
function directUrl(env) {
  const explicit = env.DIRECT_DATABASE_URL || env.DATABASE_URL_UNPOOLED;
  if (explicit) return explicit;
  const url = env.DATABASE_URL || "";
  try {
    const u = new URL(url);
    u.hostname = u.hostname.replace("-pooler.", ".");
    return u.toString();
  } catch {
    return url;
  }
}

const isProd = process.env.VERCEL_ENV === "production";
const skip = process.env.SKIP_DB_PUSH === "1";

if (isProd && !skip) {
  const url = directUrl(process.env);
  if (!url) {
    console.error("DATABASE_URL sozlanmagan — baza yangilanmadi, yig'ish to'xtatildi.");
    process.exit(1);
  }
  console.log(`Baza tuzilishi yangilanmoqda (${new URL(url).hostname})...`);
  run("npx", ["prisma", "db", "push"], { ...process.env, DATABASE_URL: url });
} else {
  console.log(
    skip
      ? "SKIP_DB_PUSH=1 — baza yangilanmadi."
      : `VERCEL_ENV=${process.env.VERCEL_ENV ?? "yo'q"} — baza faqat haqiqiy saytda yangilanadi.`,
  );
}

run("npx", ["next", "build"]);

import "server-only";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/constants";

const COOKIE = "logoped_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 kun

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 8) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET muhit o'zgaruvchisi sozlanmagan.");
    }
    return "dev-only-secret";
  }
  return s;
}

/* ---------- Parol ---------- */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

/* ---------- Sessiya cookie (imzolangan) ---------- */

type Payload = { uid: string; exp: number };

function sign(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

function encode(payload: Payload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decode(token: string): Payload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as Payload;
    if (!payload.uid || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function startSession(userId: string): Promise<void> {
  const token = encode({ uid: userId, exp: Math.floor(Date.now() / 1000) + MAX_AGE_SEC });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/* ---------- Joriy foydalanuvchi ---------- */

export type CurrentUser = {
  id: string;
  fullName: string;
  phone: string;
  role: Role;
  branchId: string | null;
  branchName: string | null;
  specialistId: string | null;
  specialization: string | null;
  /** Yakka ishlaydigan mutaxassis: markazga tegishli emas, o'ziga xo'jayin */
  isSolo: boolean;
};

type UserRow = {
  id: string;
  fullName: string;
  phone: string;
  role: Role;
  branchId: string | null;
  branchName: string | null;
  specialistId: string | null;
  specialization: string | null;
  isSolo: boolean;
};

/**
 * Kim kirgan — har bir so'rovda shu aniqlanadi, ya'ni bu eng tez-tez
 * bajariladigan so'rov. Shuning uchun ikki narsa qilingan:
 *
 * 1. `cache()` — bitta sahifa chizilganda layout ham, sahifaning o'zi ham
 *    `requireUser()` chaqiradi. Usiz bazaga ikki marta borilardi.
 * 2. Bitta SQL — `include: { branch, specialist }` da Prisma uchta alohida
 *    so'rov yuboradi. Baza chet elda turgani uchun har bir borib-kelish
 *    yuzlab millisekund, shuning uchun JOIN bilan bittaga tushirilgan.
 */
export const getCurrentUser = cache(async function getCurrentUser(): Promise<CurrentUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const payload = decode(token);
  if (!payload) return null;

  const rows = await prisma.$queryRaw<UserRow[]>`
    SELECT u."id", u."fullName", u."phone", u."role", u."branchId",
           b."name" AS "branchName", COALESCE(b."isSolo", false) AS "isSolo",
           s."id" AS "specialistId", s."specialization"
      FROM "User" u
      LEFT JOIN "Branch" b ON b."id" = u."branchId"
      LEFT JOIN "Specialist" s ON s."userId" = u."id"
     WHERE u."id" = ${payload.uid} AND u."isActive" = true
     LIMIT 1`;

  return rows[0] ?? null;
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Faqat berilgan rollarga ruxsat. Aks holda bosh sahifaga qaytaradi. */
export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  // Yakka mutaxassis o'ziga qabulxona ham — qabulxonaga ochiq sahifalar unga
  // ham ochiq. Ko'rish doirasi alohida, so'rov darajasida chegaralanadi.
  if (isSolo(user) && roles.includes("RECEPTION")) return user;
  if (!roles.includes(user.role)) redirect("/");
  return user;
}

/* ---------- Ko'rish doirasi (rolga qarab) ---------- */

export const isOwner = (u: CurrentUser) => u.role === "OWNER";
/** Markaz egasi va filial admini — pul, maosh va hisobotlarni ko'radi */
export const isAdmin = (u: CurrentUser) => u.role === "OWNER" || u.role === "BRANCH_ADMIN";
/**
 * Qabulxona ishini qiladiganlar: mijoz qabul qilish, jadval, abonement va to'lov.
 * Maosh, hisobot va xodimlar bo'limi bularga ochilmaydi.
 */
export const isFrontDesk = (u: CurrentUser) =>
  u.role === "OWNER" || u.role === "BRANCH_ADMIN" || u.role === "RECEPTION" || isSolo(u);
/**
 * Yakka mutaxassis — o'ziga ham xodim, ham xo'jayin: mijozini o'zi qo'shadi,
 * to'lovini o'zi yozadi. Shuning uchun unga qabulxona huquqi ham beriladi,
 * lekin ko'rish doirasi baribir o'z mijozlari bilan chegaralangan.
 */
export const isSolo = (u: CurrentUser) => u.role === "SPECIALIST" && u.isSolo;
export const isSpecialist = (u: CurrentUser) => u.role === "SPECIALIST";

/**
 * Kirgandan keyin qaysi sahifa ochiladi.
 *
 * Yakka mutaxassis — o'ziga rahbar ham: unga markaz egasinikidek panel
 * ochiladi (Xodimlar va Filiallarsiz). Markazdagi mutaxassis va ota-onaga
 * esa telefon kabineti qulayroq.
 */
export function homePath(u: { role: Role; isSolo?: boolean }): string {
  if (u.role === "SPECIALIST" && u.isSolo) return "/";
  if (u.role === "SPECIALIST" || u.role === "PARENT") return "/m";
  if (u.role === "RECEPTION") return "/schedule";
  return "/";
}

/**
 * Rahbar sahifalari (panel, hisobotlar): markaz egasi, filial admini va
 * yakka mutaxassis. Yakka mutaxassisning doirasi baribir o'z filiali —
 * sahifalar `branchId` ni `user.branchId` dan oladi.
 */
export async function requireManager(): Promise<CurrentUser> {
  const user = await requireUser();
  if (isAdmin(user) || isSolo(user)) return user;
  redirect(homePath(user));
}
export const isParent = (u: CurrentUser) => u.role === "PARENT";

/**
 * Markaz egasi uchun filtr: yakka mutaxassislarning filiali ko'rinmasin.
 *
 * Yakka mutaxassis bitta bazada tursa ham markazga tegishli emas — uning
 * mijozi, puli va jadvali markazning hisobotiga qo'shilmasligi kerak.
 * Shuning uchun doira bitta joyda, shu yerda belgilanadi: har bir so'rovda
 * alohida yozilsa, bittasi unutilib qolishi va ma'lumot oqib ketishi aniq.
 */
export const NOT_SOLO = { isSolo: false } as const;

/**
 * "Filial tanlangan bo'lsa o'sha, bo'lmasa butun markaz" degan filtr.
 *
 * Muhimi — "butun markaz" yakka mutaxassislarni o'z ichiga olmaydi. Shu
 * sababli har bir so'rovda `branchId ? { branchId } : {}` deb yozish mumkin
 * emas: bo'sh obyekt hamma narsani, jumladan begona yakka mutaxassisning
 * mijozlari va pulini ham qamrab olardi.
 */
export function branchWhere(branchId?: string | null) {
  return branchId ? { branchId } : { branch: { is: NOT_SOLO } };
}

/** Filiallar ro'yxatiga rolga mos filtr */
export function branchScope(user: CurrentUser) {
  if (user.role === "OWNER") return NOT_SOLO;
  return { id: user.branchId ?? "__yoq__" };
}

/**
 * Mijozlar ro'yxatiga rolga mos Prisma filtri:
 * - OWNER: markazning hamma filiali (yakka mutaxassisniki emas)
 * - BRANCH_ADMIN va RECEPTION: o'z filiali
 * - SPECIALIST: faqat o'ziga biriktirilgan mijozlar
 * - PARENT: faqat o'z farzandlari
 */
export function clientScope(user: CurrentUser) {
  switch (user.role) {
    case "OWNER":
      return { branch: { is: NOT_SOLO } };
    case "BRANCH_ADMIN":
    case "RECEPTION":
      return { branchId: user.branchId ?? "__yoq__" };
    case "SPECIALIST":
      return { specialists: { some: { specialistId: user.specialistId ?? "__yoq__" } } };
    case "PARENT":
      return { parentUserId: user.id };
  }
}

/** Seanslarga rolga mos Prisma filtri */
export function sessionScope(user: CurrentUser) {
  switch (user.role) {
    case "OWNER":
      return { branch: { is: NOT_SOLO } };
    case "BRANCH_ADMIN":
    case "RECEPTION":
      return { branchId: user.branchId ?? "__yoq__" };
    case "SPECIALIST":
      return { specialistId: user.specialistId ?? "__yoq__" };
    case "PARENT":
      return { client: { parentUserId: user.id } };
  }
}

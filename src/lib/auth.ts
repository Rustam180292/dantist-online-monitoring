import "server-only";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
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
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const payload = decode(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.uid },
    include: { branch: true, specialist: true },
  });
  if (!user || !user.isActive) return null;

  return {
    id: user.id,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role as Role,
    branchId: user.branchId,
    branchName: user.branch?.name ?? null,
    specialistId: user.specialist?.id ?? null,
    specialization: user.specialist?.specialization ?? null,
  };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Faqat berilgan rollarga ruxsat. Aks holda bosh sahifaga qaytaradi. */
export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/");
  return user;
}

/* ---------- Ko'rish doirasi (rolga qarab) ---------- */

export const isOwner = (u: CurrentUser) => u.role === "OWNER";
export const isAdmin = (u: CurrentUser) => u.role === "OWNER" || u.role === "BRANCH_ADMIN";
export const isSpecialist = (u: CurrentUser) => u.role === "SPECIALIST";
export const isParent = (u: CurrentUser) => u.role === "PARENT";

/**
 * Mijozlar ro'yxatiga rolga mos Prisma filtri:
 * - OWNER: hammasi
 * - BRANCH_ADMIN: o'z filiali
 * - SPECIALIST: faqat o'ziga biriktirilgan mijozlar
 * - PARENT: faqat o'z farzandlari
 */
export function clientScope(user: CurrentUser) {
  switch (user.role) {
    case "OWNER":
      return {};
    case "BRANCH_ADMIN":
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
      return {};
    case "BRANCH_ADMIN":
      return { branchId: user.branchId ?? "__yoq__" };
    case "SPECIALIST":
      return { specialistId: user.specialistId ?? "__yoq__" };
    case "PARENT":
      return { client: { parentUserId: user.id } };
  }
}

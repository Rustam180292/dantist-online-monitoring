// src/lib/auth.ts "server-only" bo'lgani uchun seed uchun alohida nusxa.
import { randomBytes, scryptSync } from "node:crypto";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

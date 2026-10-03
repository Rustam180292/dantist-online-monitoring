import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma";

/**
 * Bazaga ulanish.
 *
 * Ulanish birinchi so'rovdagina ochiladi: shunda `next build` DATABASE_URL
 * sozlanmagan holatda ham o'tadi (masalan Vercel'da repozitoriy ulangan,
 * lekin sozlamalar hali kiritilmagan payt). Ulanish manzili bo'lmasa, xato
 * aynan so'rov paytida va tushunarli matn bilan chiqadi.
 */
function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL muhit o'zgaruvchisi sozlanmagan. " +
        "Lokalda .env faylini, serverda esa loyiha sozlamalarini tekshiring.",
    );
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// Next.js dev rejimida hot-reload har safar yangi ulanish ochmasligi uchun global'da saqlanadi.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createClient();
  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = getClient();
    const value = Reflect.get(client, property, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

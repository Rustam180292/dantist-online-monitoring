import { getLogo } from "@/lib/settings";

/**
 * Markaz logotipi.
 *
 * Kirishsiz ochiladi: logotip kirish sahifasida ham ko'rinadi, unda maxfiy
 * narsa yo'q. Manzilga `?v=<vaqt>` qo'shib beriladi, shuning uchun brauzer
 * uni uzoq keshlashi mumkin — rasm almashsa manzil ham o'zgaradi.
 */
export async function GET(request: Request) {
  const logo = await getLogo();
  if (!logo) return new Response(null, { status: 404 });

  const versioned = new URL(request.url).searchParams.has("v");
  return new Response(new Uint8Array(logo.data), {
    headers: {
      "Content-Type": logo.mime,
      "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "no-cache",
      // Rasm boshqa turdagi fayl sifatida talqin qilinmasin
      "X-Content-Type-Options": "nosniff",
    },
  });
}

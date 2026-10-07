/**
 * Android ilovasi (APK, TWA) uchun Digital Asset Links.
 *
 * APK ichida sayt ochiladi. Android sayt shu ilovaga "tegishli" ekanini shu
 * fayl orqali tekshiradi: tasdiqlanmasa, ilova tepasida brauzer satri ko'rinib
 * qoladi. Qiymatlar koddan emas, muhit o'zgaruvchilaridan olinadi — Package ID
 * va imzo kaliti APK yasalgandan keyin ma'lum bo'ladi, kalit almashsa esa kodni
 * o'zgartirish shart bo'lmasin.
 *
 * ANDROID_PACKAGE_NAME          — masalan uz.logoped.crm
 * ANDROID_SHA256_FINGERPRINTS   — imzo kalitining SHA-256 izi; bir nechta bo'lsa
 *                                 vergul bilan (masalan o'z kalitingiz va Google
 *                                 Play kaliti)
 */
export const dynamic = "force-dynamic";

export function GET() {
  const packageName = process.env.ANDROID_PACKAGE_NAME?.trim();
  const fingerprints = (process.env.ANDROID_SHA256_FINGERPRINTS ?? "")
    .split(",")
    .map((x) => x.trim().toUpperCase())
    .filter((x) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(x));

  // Sozlanmagan bo'lsa fayl yo'q — noto'g'ri ma'lumot bergandan ko'ra yaxshi
  if (!packageName || fingerprints.length === 0) {
    return new Response("Not found", { status: 404 });
  }

  return Response.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: packageName,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ],
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}

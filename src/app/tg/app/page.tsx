import { redirect } from "next/navigation";

/**
 * Eski manzil. Kabinet endi /m da — eski havolalar ishlayversin deb
 * shu yerda yo'naltirib yuboriladi.
 */
export default async function LegacyMiniAppPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
  }
  const qs = query.toString();
  redirect(qs ? `/m?${qs}` : "/m");
}

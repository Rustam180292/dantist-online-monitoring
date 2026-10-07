/**
 * Markaz belgisi: logotip yuklangan bo'lsa rasm, bo'lmasa "L" harfi.
 *
 * Oddiy <img> ishlatilgan, next/image emas: rasm o'zimizning /api/logo
 * manzilidan keladi va allaqachon kichik, qayta ishlash shart emas.
 */
export function BrandMark({
  logoUrl,
  size = "md",
}: {
  logoUrl: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const box = { sm: "h-8 w-8 text-xs", md: "h-9 w-9 text-sm", lg: "h-12 w-12 text-lg rounded-xl" }[size];
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        data-testid="brand-logo"
        className={`${box} shrink-0 rounded-lg bg-white object-contain`}
      />
    );
  }
  return (
    <div
      className={`${box} flex shrink-0 items-center justify-center rounded-lg bg-indigo-600 font-bold text-white`}
    >
      L
    </div>
  );
}

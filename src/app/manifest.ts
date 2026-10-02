import type { MetadataRoute } from "next";

/** Telefonning bosh ekraniga o'rnatish uchun ilova ta'rifi */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Logopedik markaz CRM",
    short_name: "Logoped CRM",
    description:
      "Logopedik markaz boshqaruvi: jadval, davomat, mijozlar, abonementlar va to'lovlar.",
    lang: "uz",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#4f46e5",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

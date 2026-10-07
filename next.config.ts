import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: false,
  experimental: {
    serverActions: {
      // Standart chegara 1 MB. Logotip brauzerda kichraytiriladi, lekin eski
      // brauzerda kichraytirish ishlamay qolsa fayl o'z holicha keladi —
      // shunda ham "Rasm hajmi 500 KB dan oshmasin" degan tushunarli xabar
      // chiqsin, umumiy xato ekrani emas.
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;

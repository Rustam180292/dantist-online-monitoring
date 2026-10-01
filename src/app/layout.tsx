import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Logopedik markaz CRM",
  description:
    "Logopedik markaz uchun boshqaruv tizimi: filiallar, mutaxassislar, mijozlar, jadval, davomat va to'lovlar.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz">
      <body>{children}</body>
    </html>
  );
}

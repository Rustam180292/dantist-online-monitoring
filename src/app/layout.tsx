import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/components/pwa";
import "./globals.css";

export const metadata: Metadata = {
  title: "Logopedik markaz CRM",
  description:
    "Logopedik markaz uchun boshqaruv tizimi: filiallar, mutaxassislar, mijozlar, jadval, davomat va to'lovlar.",
  applicationName: "Logoped CRM",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Logoped CRM",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}

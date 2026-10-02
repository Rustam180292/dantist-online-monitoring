import Script from "next/script";

export const metadata = {
  title: "Logoped CRM — kabinet",
};

export default function TelegramLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Telegram Mini App SDK — initData va mavzu ranglari shundan olinadi */}
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <div className="app-shell min-h-screen">{children}</div>
    </>
  );
}

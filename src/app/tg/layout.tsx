import Script from "next/script";

export const metadata = {
  title: "Logoped CRM — kabinet",
};

export default function TelegramLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Telegram Mini App SDK — initData va mavzu ranglari shundan olinadi */}
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <div className="tg-root min-h-screen">{children}</div>
      <style>{`
        .tg-root {
          background: var(--tg-theme-bg-color, #f8fafc);
          color: var(--tg-theme-text-color, #0f172a);
        }
        .tg-card {
          background: var(--tg-theme-secondary-bg-color, #ffffff);
          border-radius: 14px;
        }
        .tg-muted { color: var(--tg-theme-hint-color, #64748b); }
        .tg-link { color: var(--tg-theme-link-color, #4f46e5); }
        .tg-accent {
          background: var(--tg-theme-button-color, #4f46e5);
          color: var(--tg-theme-button-text-color, #ffffff);
        }
      `}</style>
    </>
  );
}

"use client";

type TgWebApp = { openTelegramLink?: (url: string) => void };

/**
 * t.me havolasi. Mini App ichida oddiy havola Telegram'ning o'zida emas,
 * ichki brauzer oynasida ochilib qoladi — shuning uchun Telegram ichida
 * `openTelegramLink` bilan suhbatga to'g'ridan-to'g'ri o'tkaziladi.
 * Brauzerda (APK, sayt) oddiy havola bo'lib ishlayveradi.
 */
export function TgLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        const tg = (window as unknown as { Telegram?: { WebApp?: TgWebApp & { initData?: string } } })
          .Telegram?.WebApp;
        if (tg?.initData && tg.openTelegramLink) {
          e.preventDefault();
          tg.openTelegramLink(href);
        }
      }}
    >
      {children}
    </a>
  );
}

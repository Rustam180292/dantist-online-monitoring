"use client";

import { createContext, useContext, useState } from "react";

/**
 * Ota-ona kabinetining bo'limlari.
 *
 * Hamma bo'lim serverda bir martada chiziladi, bu yerda faqat qaysi biri
 * ko'rinishi almashadi. Avval har bir bo'lim alohida sahifa edi — server
 * bazaga qayta-qayta borar, baza esa uzoqda turgani uchun har bosishda
 * yarim soniyacha kutilardi. Endi bo'lim bosilganda darhol ochiladi.
 */
const TabContext = createContext<{ tab: string; setTab: (t: string) => void }>({
  tab: "",
  setTab: () => {},
});

export function ParentTabs({ initial, children }: { initial: string; children: React.ReactNode }) {
  const [tab, setTabState] = useState(initial);
  const setTab = (next: string) => {
    setTabState(next);
    // Manzil ham yangilanadi: sahifa yangilansa (masalan bekor qilgandan
    // keyin) o'sha bo'limda qolsin
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // manzilni yangilab bo'lmasa ham bo'lim almashadi
    }
  };
  return <TabContext.Provider value={{ tab, setTab }}>{children}</TabContext.Provider>;
}

export function ParentTabNav({ tabs }: { tabs: { key: string; label: string }[] }) {
  const { tab, setTab } = useContext(TabContext);
  return (
    <nav className="mb-3 flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((x) => (
        <button
          key={x.key}
          type="button"
          data-tab={x.key}
          aria-pressed={x.key === tab}
          onClick={() => setTab(x.key)}
          className={`shrink-0 rounded-xl px-3 py-1.5 text-sm font-medium ${
            x.key === tab ? "app-accent" : "app-card app-muted"
          }`}
        >
          {x.label}
        </button>
      ))}
    </nav>
  );
}

export function TabPanel({ name, children }: { name: string; children: React.ReactNode }) {
  const { tab } = useContext(TabContext);
  return <div hidden={tab !== name}>{children}</div>;
}

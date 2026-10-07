"use client";

import { useRef, useState } from "react";
import { useT } from "@/components/i18n";
import { btnPrimary } from "@/components/ui";

/**
 * Logotip tanlash maydoni.
 *
 * Nega oddiy `<input type="file">` emas: markaz egasi logotipni telefondan
 * tanlaydi, telefon rasmi esa odatda 2-5 MB bo'ladi. Bunday fayl serverga
 * yetib ham bormaydi — Next so'rovni o'zi rad etadi va foydalanuvchi "nimadir
 * xato bo'ldi" degan foydasiz ekranni ko'radi. Shuning uchun rasmni
 * yuborishdan oldin shu yerda, brauzerning o'zida kichraytiramiz: logotip
 * menyuda kichkina ko'rinadi, 512 pikseldan katta bo'lishining hojati yo'q.
 */

const MAX_SIDE = 512;
const MAX_BYTES = 500 * 1024;

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Rasmni 512 pikselgacha kichraytirib, 500 KB ga sig'adigan nusxa qaytaradi */
async function shrink(file: File): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  // Sifatni asta pasaytirib boramiz; webp qo'llab-quvvatlanmasa brauzer
  // o'zi png qaytaradi — server ikkalasini ham qabul qiladi
  for (const quality of [0.92, 0.8, 0.65]) {
    const blob = await toBlob(canvas, "image/webp", quality);
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  return toBlob(canvas, "image/jpeg", 0.7);
}

export function LogoInput({ inputClassName = "" }: { inputClassName?: string }) {
  const t = useT();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function onChange() {
    const input = ref.current;
    const file = input?.files?.[0];
    setNote(null);
    if (!input || !file) return;
    // Kichik fayl o'z holicha ketaveradi — sifatini bekorga buzmaymiz
    if (file.size <= MAX_BYTES) return;

    setBusy(true);
    // Eski brauzerda createImageBitmap yoki DataTransfer bo'lmasligi mumkin —
    // u holda rasm o'z holicha ketadi va serverdan tushunarli xabar qaytadi
    const small = await shrink(file).catch(() => null);
    if (small && small.size <= MAX_BYTES) {
      const ext = small.type === "image/jpeg" ? "jpg" : small.type === "image/png" ? "png" : "webp";
      const dt = new DataTransfer();
      dt.items.add(new File([small], `logo.${ext}`, { type: small.type }));
      input.files = dt.files;
      setNote(t("Rasm kichraytirildi — endi yuklash mumkin."));
    } else {
      input.value = "";
      setNote(t("Bu rasmni kichraytirib bo'lmadi. Kichikroq rasm tanlang."));
    }
    setBusy(false);
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={ref}
          id="logo"
          name="logo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          required
          onChange={onChange}
          className={inputClassName}
        />
        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy ? t("Tayyorlanmoqda...") : t("Yuklash")}
        </button>
      </div>
      {note ? <p className="text-xs text-slate-500 dark:text-slate-400">{note}</p> : null}
    </div>
  );
}

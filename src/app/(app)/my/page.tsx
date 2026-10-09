import { redirect } from "next/navigation";

/**
 * Eski "Farzandim" sahifasi. Endi u ota-onaning Telegram kabinetidagi bo'lim
 * (`/m`), ota-onani u yerga layout'ning o'zi yuboradi. Manzil saqlab
 * qolingan, chunki eski havola va xatcho'plar 404 bermasin.
 */
export default function OldMyChildrenPage() {
  redirect("/");
}

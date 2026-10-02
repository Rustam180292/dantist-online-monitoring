import type { SVGProps } from "react";

export type IconKey =
  | "home"
  | "calendar"
  | "users"
  | "badge"
  | "wallet"
  | "chart"
  | "child"
  | "phone"
  | "logout";

const PATHS: Record<IconKey, string> = {
  home: "M3 10.5 12 3l9 7.5M5.25 9.5V20a1 1 0 0 0 1 1h3.5v-5.5h4.5V21h3.5a1 1 0 0 0 1-1V9.5",
  calendar:
    "M7 3v3m10-3v3M3.5 8.5h17M4.5 6.5h15a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1ZM8 12.5h2m4 0h2M8 16.5h2m4 0h2",
  users:
    "M15.5 20v-1.5a3.5 3.5 0 0 0-3.5-3.5H7a3.5 3.5 0 0 0-3.5 3.5V20M12.75 7.75a3.25 3.25 0 1 1-6.5 0 3.25 3.25 0 0 1 6.5 0ZM20.5 20v-1.5a3.5 3.5 0 0 0-2.75-3.42M16 4.6a3.25 3.25 0 0 1 0 6.3",
  badge:
    "M12 3.5 14.2 8l5 .7-3.6 3.5.85 4.95L12 14.8l-4.45 2.35.85-4.95L4.8 8.7l5-.7L12 3.5ZM8 20.5h8",
  wallet:
    "M3.5 8.5v10a1 1 0 0 0 1 1h15a1 1 0 0 0 1-1v-10M3.5 8.5a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1M3.5 8.5 6 4.5h12l2.5 4M16 14h2",
  chart: "M4 20V4m0 16h16M8 16.5V11m4 5.5V7.5m4 9v-4",
  child:
    "M12 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0 0v3m0 0-3 5m3-5 3 5M8 13.5h8",
  phone:
    "M7.5 3.5h9a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Zm3 14h3",
  logout: "M15 8.5V6a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2.5M9.5 12h11m0 0-3-3m3 3-3 3",
};

export function Icon({
  name,
  ...props
}: { name: IconKey } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

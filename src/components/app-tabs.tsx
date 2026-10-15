"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const TABS = [
  { href: "/", label: "Documents" },
  { href: "/verify", label: "Verify identity" },
];

export default function AppTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sections"
      className="grid grid-cols-2 gap-1 rounded-xl border border-slate-800 bg-slate-900/60 p-1"
    >
      {TABS.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "rounded-lg px-3 py-2 text-center text-xs font-semibold transition",
              active
                ? "bg-sky-500/15 text-sky-200 ring-1 ring-sky-500/30"
                : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

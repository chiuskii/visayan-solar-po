"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string };

export function NavLinks({ items }: { items: Item[] }) {
  const path = usePathname();
  return (
    <nav className="flex flex-row gap-1 overflow-x-auto md:flex-col">
      {items.map((it) => {
        const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`rounded-md px-3 py-2 text-sm whitespace-nowrap ${
              active ? "bg-brand-600 font-medium text-white" : "text-brand-50 hover:bg-brand-700"
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

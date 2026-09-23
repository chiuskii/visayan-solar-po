import Link from "next/link";
import { STATUS_LABEL } from "@/lib/format";

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  ORDERED: "bg-blue-50 text-blue-700",
  PARTIAL: "bg-amber-50 text-amber-800",
  DELIVERED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-700",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${STATUS_STYLE[status] ?? ""}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {back && (
          <Link href={back.href} className="text-sm text-brand-600 hover:underline">
            ← {back.label}
          </Link>
        )}
        <h1 className="mt-1">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-slate-500">{children}</div>;
}

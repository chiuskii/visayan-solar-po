const pesoFmt = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 });
const numFmt = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 });

export const peso = (n: number | null | undefined) => pesoFmt.format(Number(n) || 0);
export const num = (n: number | null | undefined) => numFmt.format(Number(n) || 0);

export function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  if (!y) return d;
  return new Date(y, m - 1, day).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

/** Today's date in Manila as YYYY-MM-DD. */
export function todayPH() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  ORDERED: "Ordered",
  PARTIAL: "Partially delivered",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

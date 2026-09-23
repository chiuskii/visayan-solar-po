"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { BulkDeleteResult } from "@/app/actions/masters";

/**
 * Wraps a server-rendered table whose rows have `<input type="checkbox" data-bulk-id={id}>`
 * (and a header `data-bulk-all` box), and shows Edit / Delete actions for the ticked rows.
 */
export function BulkSelect({
  entity,
  singular,
  plural,
  bulkDelete,
  children,
}: {
  entity: string;
  singular: string;
  plural: string;
  bulkDelete: (ids: number[]) => Promise<BulkDeleteResult>;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [selected, setSelected] = useState<number[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<BulkDeleteResult | null>(null);
  const [pending, startTransition] = useTransition();

  const boxes = () => [...(ref.current?.querySelectorAll<HTMLInputElement>("input[data-bulk-id]") ?? [])];
  const sync = () => {
    const all = boxes();
    const ids = all.filter((b) => b.checked).map((b) => Number(b.dataset.bulkId));
    const head = ref.current?.querySelector<HTMLInputElement>("input[data-bulk-all]");
    if (head) {
      head.checked = all.length > 0 && ids.length === all.length;
      head.indeterminate = ids.length > 0 && ids.length < all.length;
    }
    setSelected(ids);
    setConfirming(false);
  };
  const setAll = (checked: boolean) => {
    for (const b of boxes()) b.checked = checked;
    sync();
  };

  function onChange(e: React.ChangeEvent<HTMLDivElement>) {
    const t = e.target as unknown as HTMLInputElement;
    if (t.dataset.bulkAll !== undefined) setAll(t.checked);
    else if (t.dataset.bulkId !== undefined) sync();
  }

  function remove() {
    startTransition(async () => {
      const res = await bulkDelete(selected);
      setResult(res);
      setAll(false);
      router.refresh();
    });
  }

  const n = selected.length;
  const label = `${n} ${n === 1 ? singular : plural}`;
  return (
    <div ref={ref} onChange={onChange}>
      {result && (
        <div className={`${result.skipped.length ? "error-box" : "ok-box"} mb-4 flex items-start justify-between gap-3`}>
          <span>
            Deleted {result.deleted} {result.deleted === 1 ? singular : plural}.
            {result.skipped.length > 0 &&
              ` Kept ${result.skipped.length} that ${result.skipped.length === 1 ? "is" : "are"} used on purchase orders: ${result.skipped.join(", ")}.`}
          </span>
          <button type="button" className="text-sm underline" onClick={() => setResult(null)}>Dismiss</button>
        </div>
      )}
      {n > 0 && (
        <div className="card sticky top-[env(safe-area-inset-top,0px)] z-10 mb-3 flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
          <span className="font-medium">{label} selected</span>
          <span className="flex-1" />
          {confirming ? (
            <>
              <span className="text-red-700">Delete {label}? This can’t be undone.</span>
              <button type="button" className="btn btn-sm btn-danger" onClick={remove} disabled={pending}>
                {pending ? "Deleting…" : "Yes, delete"}
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setConfirming(false)} disabled={pending}>Keep</button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-sm" onClick={() => router.push(`/${entity}/bulk-edit?ids=${selected.join(",")}`)}>
                Edit selected
              </button>
              <button type="button" className="btn btn-sm btn-danger" onClick={() => setConfirming(true)}>Delete selected</button>
              <button type="button" className="btn btn-sm" onClick={() => setAll(false)}>Clear</button>
            </>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

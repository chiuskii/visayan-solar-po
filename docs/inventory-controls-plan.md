# Inventory controls — change plan (target: live by Tue Oct 20, 2026)

Why: Anthony's Monday task 2869771895 needs request → OUT → returns → IN → receipts → project P&L
to reconcile. This plan builds on the **uncommitted job-order work already in this repo**
(migration 0011, `src/lib/job-orders.ts`, `/inventory/job-orders`). Production doesn't have it yet:
prod still shows free-text "J-O no4" references.

Order matters. Do the steps top to bottom, run `npm run typecheck` after each, and test in
`docker-compose.dev.yml` before deploying.

---

## Step 0 — Ship the job-order work you already have

1. Commit what's in `git status` (0011, job-orders pages, print, API).
2. Add migration **0012_backfill_job_orders.sql** (below), so the Oct 8–17 issues already in prod
   get real JO numbers. Run it **once, before anyone issues with the new build**. It assumes
   `job_orders` is empty, which is true on first deploy.

```sql
-- One job order per client per issue date, for issues recorded before job orders existed.
INSERT INTO job_orders (jo_number, client_id, jo_date, reference, notes)
SELECT CONCAT('VS-JO-', YEAR(g.d), '-', LPAD(ROW_NUMBER() OVER (ORDER BY g.d, g.client_id), 4, '0')),
       g.client_id, g.d, g.ref, 'Backfilled from issues before job orders'
FROM (SELECT client_id, movement_date AS d, MAX(reference) AS ref
      FROM stock_movements
      WHERE type = 'ISSUE' AND job_order_id IS NULL AND client_id IS NOT NULL
      GROUP BY client_id, movement_date) g;

UPDATE stock_movements sm
JOIN job_orders jo ON jo.client_id = sm.client_id AND jo.jo_date = sm.movement_date
                  AND jo.notes = 'Backfilled from issues before job orders'
SET sm.job_order_id = jo.id
WHERE sm.type = 'ISSUE' AND sm.job_order_id IS NULL;

INSERT INTO job_order_items (job_order_id, material_id, description, spec, unit, quantity, sort_order)
SELECT sm.job_order_id, m.id, m.name, m.spec, m.unit, -SUM(sm.quantity), 0
FROM stock_movements sm JOIN materials m ON m.id = sm.material_id
JOIN job_orders jo ON jo.id = sm.job_order_id AND jo.notes = 'Backfilled from issues before job orders'
GROUP BY sm.job_order_id, m.id;
```

Note: the WIP creates **one JO per release** (each "Assign to client"). That's fine. The
**project** is the client, and the project cost report (Step 7) adds up all of a client's JOs.

---

## Step 1 — Migration 0013_inventory_controls.sql

Adds returns, a unit cost on every movement, reversals instead of deletes, and the recipient on JOs.

```sql
ALTER TABLE `stock_movements`
  MODIFY COLUMN `type` enum('RECEIVE','ISSUE','RETURN','ADJUST') NOT NULL,
  ADD COLUMN `unit_cost` decimal(14,2) NULL AFTER `quantity`,
  ADD COLUMN `reversal_of_id` int NULL AFTER `job_order_id`,
  ADD CONSTRAINT `stock_movements_reversal_fk` FOREIGN KEY (`reversal_of_id`) REFERENCES `stock_movements`(`id`) ON DELETE SET NULL;

ALTER TABLE `job_orders` ADD COLUMN `received_by` varchar(120) NULL AFTER `reference`;

-- Backfill costs: receipts at their PO price, everything else at today's default cost.
UPDATE stock_movements sm JOIN po_items pi ON pi.id = sm.po_item_id
SET sm.unit_cost = pi.unit_cost WHERE sm.type = 'RECEIVE';
UPDATE stock_movements sm JOIN materials m ON m.id = sm.material_id
SET sm.unit_cost = m.default_cost WHERE sm.unit_cost IS NULL;
```

Then in `src/db/types.ts`:
- `STOCK_TYPES = ["RECEIVE", "ISSUE", "RETURN", "ADJUST"]`
- `StockMovement`: add `unitCost: number | null; reversalOfId: number | null;`
- `JobOrder`: add `receivedBy: string | null;`
- `COLUMNS.stock_movements`: add `unitCost: "unit_cost", reversalOfId: "reversal_of_id"`
- `COLUMNS.job_orders`: add `receivedBy: "received_by"`
- Add `sm.unit_cost AS unitCost, sm.reversal_of_id AS reversalOfId` to `MOVEMENT_SELECT` in `src/lib/inventory.ts`.

---

## Step 2 — Put a cost on every movement (`src/lib/inventory.ts`)

**a. Receipts carry the PO price.** In `syncPoStock`, add the column and value:

```sql
INSERT INTO stock_movements (material_id, type, quantity, unit_cost, movement_date, delivery_id, po_item_id, reference, created_by_id)
SELECT pi.material_id, 'RECEIVE', di.quantity, pi.unit_cost, d.delivery_date, d.id, pi.id, ...
```

**b. Average cost helper**, used for issues and adjustments:

```ts
/** Average cost of stock that came in (receipts, returns, + adjustments); falls back to the default cost. */
export async function avgCostByMaterial(materialIds: number[], conn: PoolConnection) {
  const map = new Map<number, number>();
  if (materialIds.length === 0) return map;
  const rows = await query<{ materialId: number; avg: number | null; def: number }>(
    `SELECT m.id AS materialId, m.default_cost AS def,
            SUM(CASE WHEN sm.quantity > 0 AND sm.unit_cost > 0 THEN sm.quantity * sm.unit_cost END)
              / NULLIF(SUM(CASE WHEN sm.quantity > 0 AND sm.unit_cost > 0 THEN sm.quantity END), 0) AS avg
     FROM materials m LEFT JOIN stock_movements sm ON sm.material_id = m.id
     WHERE m.id IN (?) GROUP BY m.id`,
    [materialIds],
    conn,
  );
  for (const r of rows) map.set(r.materialId, Math.round(Number(r.avg ?? r.def ?? 0) * 100) / 100);
  return map;
}
```

**c. `recordAdjustment`**: set `unitCost` on the insert. Use `avgCostByMaterial([a.materialId], conn)`
for that material (falls back to default cost).

---

## Step 3 — Issue form: recipient required, no ₱0 cost (`src/app/actions/inventory.ts` → `issueStock`)

1. Add `receivedBy: z.string().trim().min(1, "Enter who received the materials (team lead).").max(120)`
   to `issueSchema`, read it from `formData.get("receivedBy")`, and save it on the `job_orders` insert.
2. After the on-hand check, block materials with no cost:

```ts
const cost = await avgCostByMaterial(ids, conn);
const noCost = mats.find((m) => !((cost.get(m.id) ?? 0) > 0));
if (noCost) return { error: `“${noCost.name}” has no cost yet. Set its default cost in Materials before issuing.` };
```

3. Add `unit_cost` to the ISSUE insert: column list `(material_id, type, quantity, unit_cost, ...)`,
   value `cost.get(materialId)`.
4. `src/components/inventory-forms.tsx` (issue form, near the `reference` input around line 96):
   add a required **Received by (team lead)** input `name="receivedBy"`.
5. `src/app/(print)/job-orders/[id]/print/page.tsx`: print "Received by: ____" with the name and a signature line.

---

## Step 4 — Returns (new)

**Action** in `src/app/actions/inventory.ts`:

```ts
/** Puts unused materials from a job order back in stock, at the cost they went out at. */
export async function returnToStock(joId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  let lines: unknown = [];
  try { lines = JSON.parse(String(formData.get("lines") ?? "[]")); } catch { lines = []; }
  const parsed = z.object({
    movementDate: dateStr,
    notes: optText(2000),
    lines: z.array(z.object({ materialId: z.number().int().positive(), quantity: z.number().positive() })).min(1, "Enter at least one quantity returned."),
  }).safeParse({ movementDate: formData.get("movementDate") ?? "", notes: formData.get("notes") ?? "", lines });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const { movementDate, notes } = parsed.data;

  const error = await transaction(async (conn) => {
    const jo = await queryOne<{ joNumber: string; clientId: number | null; status: string }>(
      "SELECT jo_number AS joNumber, client_id AS clientId, status FROM job_orders WHERE id = ? FOR UPDATE", [joId], conn);
    if (!jo) return "This job order no longer exists.";
    if (jo.status === "CANCELLED") return "This job order is cancelled.";
    const out = await query<{ materialId: number; qty: number; cost: number | null }>(
      `SELECT material_id AS materialId, -SUM(quantity) AS qty, MAX(CASE WHEN type = 'ISSUE' THEN unit_cost END) AS cost
       FROM stock_movements WHERE job_order_id = ? AND type IN ('ISSUE','RETURN') GROUP BY material_id`, [joId], conn);
    const byMat = new Map(out.map((o) => [o.materialId, o]));
    for (const l of parsed.data.lines) {
      const o = byMat.get(l.materialId);
      if (!o || l.quantity > Number(o.qty)) return `Only ${o?.qty ?? 0} of that material is still out on ${jo.joNumber}.`;
    }
    await execute(
      "INSERT INTO stock_movements (material_id, type, quantity, unit_cost, movement_date, client_id, job_order_id, reference, notes, created_by_id) VALUES ?",
      [parsed.data.lines.map((l) => [l.materialId, "RETURN", round2(l.quantity), byMat.get(l.materialId)!.cost, movementDate, jo.clientId, joId, `Return · ${jo.joNumber}`, notes, user.id])],
      conn,
    );
    return null;
  });
  if (error) return { error };
  revalidatePath("/inventory");
  redirect(`/inventory/job-orders/${joId}?saved=returned`);
}
```

**UI:** on `src/app/(app)/inventory/job-orders/[id]/page.tsx`, add a "Record return" form under the
items. Copy the pattern of `src/components/delivery-form.tsx`: one row per JO item showing
*Issued / Returned / Still out* and a "Returned now" input. Add a `saved === "returned"` message.

Also show RETURN in the ledger and in `client-materials.tsx`: net qty = ISSUE + RETURN.

---

## Step 5 — Lock down the log (no deletes, no clearing)

1. **Remove "Clear log".** Delete the button block in `src/app/(app)/inventory/page.tsx` (around line 103)
   and the `clearMovementLog` export (or make it `throw new Error("Disabled")`).
2. **Replace `deleteMovement` with `reverseMovement`** (admin, reason required). It never deletes.
   It adds an opposite ADJUST linked by `reversal_of_id`:

```ts
export async function reverseMovement(id: number, materialId: number, formData: FormData) {
  const user = await requireAdmin();
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 2000);
  if (!reason) redirect(`/inventory/${materialId}?error=reason`);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  try {
    await transaction(async (conn) => {
      const m = await queryOne<{ type: StockType; quantity: number; unitCost: number | null; reversalOfId: number | null }>(
        "SELECT type, quantity, unit_cost AS unitCost, reversal_of_id AS reversalOfId FROM stock_movements WHERE id = ? AND material_id = ? FOR UPDATE",
        [id, materialId], conn);
      // Issues → cancel the job order; receipts → fix the PO delivery. Only adjustments are reversed here.
      if (!m || m.type !== "ADJUST" || m.reversalOfId) return;
      if (await queryOne("SELECT id FROM stock_movements WHERE reversal_of_id = ?", [id], conn)) return;
      await execute("INSERT INTO stock_movements SET ?", [toRow("stock_movements", {
        materialId, type: "ADJUST", quantity: -m.quantity, unitCost: m.unitCost, movementDate: today,
        reversalOfId: id, reference: `Reverses #${id}`, notes: reason, createdById: user.id })], conn);
      await assertNoNegativeStock([materialId], conn);
    });
  } catch (e) {
    if (e instanceof NegativeStockError) redirect(`/inventory/${materialId}?error=negative`);
    throw e;
  }
  revalidatePath(`/inventory/${materialId}`);
}
```
   In `src/app/(app)/inventory/[id]/page.tsx` (line ~89), swap the Remove `ConfirmButton` for a
   small form with a `reason` input and a **Reverse** button, shown only for `ADJUST` rows with no reversal yet.

3. **`cancelJobOrder` must not delete movements.** Replace the `DELETE FROM stock_movements…` /
   `stillLogged` logic with RETURN rows for whatever is still out:

```ts
const out = await query<{ materialId: number; qty: number; cost: number | null }>(
  `SELECT material_id AS materialId, -SUM(quantity) AS qty, MAX(CASE WHEN type = 'ISSUE' THEN unit_cost END) AS cost
   FROM stock_movements WHERE job_order_id = ? AND type IN ('ISSUE','RETURN') GROUP BY material_id HAVING qty > 0`, [id], conn);
if (out.length) await execute(
  "INSERT INTO stock_movements (material_id, type, quantity, unit_cost, movement_date, client_id, job_order_id, reference, notes, created_by_id) VALUES ?",
  [out.map((o) => [o.materialId, "RETURN", o.qty, o.cost, today, jo.clientId, id, jo.joNumber, `Job order ${jo.joNumber} cancelled`, user.id])], conn);
```
   (Select `client_id AS clientId` in the `jo` query.) Then project cost nets to zero and the history stays.

4. **Adjustments:** staff may record **counts only** (`mode = "set"`). `+ / −` changes are admin-only.
   In `adjustStock`: `if (mode === "change" && user.role !== "ADMIN") return { error: "Only an admin can add or remove stock. Record a count, or receive it through the PO." };`
   Apply the same rule in `src/app/api/v1/inventory/adjustments/route.ts` (allow `set` only, unless the key is meant for admin use).

---

## Step 6 — PO receiving cutover (stock IN only through "Record a delivery")

Today's stock came in through counts, so recording old deliveries now would **double** it. Cut over like this:

1. Darwin records the deliveries already received on POs 0002–0008 (DR no., qty, received by), so Apol can 3-way match.
2. Right after, an admin runs this once, so those old deliveries don't add stock a second time:

```sql
UPDATE company_settings SET stock_cleared_delivery_id = (SELECT MAX(id) FROM deliveries) WHERE id = 1;
DELETE sm FROM stock_movements sm JOIN deliveries d ON d.id = sm.delivery_id
WHERE sm.type = 'RECEIVE' AND d.id <= (SELECT stock_cleared_delivery_id FROM company_settings WHERE id = 1);
```
3. Do a full count (Adjust → Set) of every material, witnessed by Apol or Lou. That's the clean opening balance.
4. From then on, new stock arrives only through PO deliveries. Step 5.4 stops staff from adding stock any other way.

---

## Step 7 — Project cost report (what Apol pulls into the P&L)

New `src/lib/project-cost.ts` with two queries, shown on `/clients/[id]` (or `/inventory/clients?client=`) with a CSV export (copy `clients/export/route.ts`):

```sql
-- Warehouse materials for the project, net of returns, at the cost they went out at
SELECT m.name, m.spec, m.unit, -SUM(sm.quantity) AS qty, ROUND(SUM(-sm.quantity * COALESCE(sm.unit_cost, 0)), 2) AS cost
FROM stock_movements sm JOIN materials m ON m.id = sm.material_id
WHERE sm.client_id = ? AND sm.type IN ('ISSUE','RETURN')
GROUP BY m.id HAVING qty <> 0 ORDER BY cost DESC;

-- Direct-to-site POs for the project
SELECT po.po_number, pi.description, pi.unit, pi.quantity, pi.unit_cost,
       ROUND(pi.quantity * pi.unit_cost, 2) AS amount,
       COALESCE((SELECT SUM(di.quantity) FROM delivery_items di WHERE di.po_item_id = pi.id), 0) AS received
FROM purchase_orders po JOIN po_items pi ON pi.po_id = po.id
WHERE po.client_id = ? AND po.to_warehouse = 0 AND po.status <> 'CANCELLED';
```
Show the totals: **Warehouse materials + Direct POs = Materials cost**. Flag direct-PO lines where `received < quantity`.

For the Romar Yan pilot (client id 7) you can run these two queries directly on Oct 21 if the page isn't ready yet.

---

## Step 8 — Clean the materials list (data, not code)

- Fill the 27 materials with ₱0 default cost (Materials → Bulk edit). Step 3 blocks issuing them until then.
- Merge duplicates. Check each pair's unit first. Battery Wire 50mm is "pc" in one record and "m" in the other, so convert the qty before merging.
  Candidates: Aluminium Rails (59) / Aluminum Rail (25), AC MCB 100A (61 / 86), L-Foot / L-foot, Mid Clamp / Midclamp,
  End Clamp / Endclamp, PVC Pipe 1 (45) / Pvc Pipe 1, Inverter 6kW Deye (57) / Deye 6kw Inverter,
  Battery Wire 50mm B/R (43) / BATTERY WIRE BLACK AND RED 50MM (105).

```sql
SET @keep = 59, @dup = 25;  -- one pair at a time
UPDATE stock_movements   SET material_id = @keep WHERE material_id = @dup;
UPDATE po_items          SET material_id = @keep WHERE material_id = @dup;
UPDATE bundle_items      SET material_id = @keep WHERE material_id = @dup;
UPDATE job_order_items   SET material_id = @keep WHERE material_id = @dup;
DELETE FROM materials WHERE id = @dup;
```

---

## Later (after Oct 23) — Leyte location

Add `location enum('CEBU','LEYTE') NOT NULL DEFAULT 'CEBU'` to `stock_movements`, `job_orders` and `purchase_orders`.
Filter `onHandByMaterial` / `assertNoNegativeStock` by location, and add a Transfer (OUT Cebu + IN Leyte) for shipments.
Until then, Leyte releases are issued from Cebu stock to the Leyte client JO at shipment.

---

## Test before deploy (dev compose)

1. Issue to a client with no recipient → refused. With a ₱0-cost material → refused.
2. Issue 10, return 3 → ledger shows ISSUE −10 and RETURN +3, and project cost = 7 × cost.
3. Return more than is still out → refused.
4. Cancel a JO → RETURN rows added, nothing deleted, and project cost = 0.
5. Staff tries Adjust "change" → refused. Staff "set" works.
6. Record a PO delivery → stock goes up with the PO unit cost.
7. Clear log button gone. Reverse an adjustment → opposite row with reason, original kept.
8. `npm run typecheck` is clean. Then deploy (`docker compose -f docker-compose.prod.yml --env-file .env up -d --build`); migrations run on start.

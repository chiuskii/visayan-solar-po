-- Fills in materials with no default cost (₱0), and re-costs their stock movements.
--
--   1. Each ₱0 material gets the unit price from its latest PO line that has a price.
--   2. Movements of those materials that were costed at ₱0 (assignments, returns and adjustments;
--      migration 0013 gave them the ₱0 default cost) are re-costed at the material's default cost.
--      Receipts keep their PO price.
--   3. Lists the materials still at ₱0. Fill those in: Materials → "Export them" (the ₱0 list),
--      enter default_cost, then Materials → Import. Then run this script again so step 2
--      re-costs their movements too.
--
-- Safe to run more than once: it only changes costs that are still ₱0.
--
-- Run on the NAS, from the app folder (back up the database first):
--   docker compose -f docker-compose.prod.yml --env-file .env exec -T db \
--     sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" --table' < scripts/one-time/fill-material-costs.sql

START TRANSACTION;

SELECT COUNT(*) AS materials_at_zero_before FROM materials WHERE default_cost = 0;

-- 1. Latest PO price.
UPDATE materials m
JOIN (
	SELECT pi.material_id, pi.unit_cost,
	       ROW_NUMBER() OVER (PARTITION BY pi.material_id ORDER BY po.po_date DESC, pi.id DESC) AS rn
	FROM po_items pi JOIN purchase_orders po ON po.id = pi.po_id
	WHERE pi.material_id IS NOT NULL AND pi.unit_cost > 0 AND po.status <> 'CANCELLED'
) latest ON latest.material_id = m.id AND latest.rn = 1
SET m.default_cost = latest.unit_cost
WHERE m.default_cost = 0;

SELECT ROW_COUNT() AS filled_from_po_price;

-- 2. Re-cost ₱0 movements (not receipts) at the default cost.
UPDATE stock_movements sm JOIN materials m ON m.id = sm.material_id
SET sm.unit_cost = m.default_cost
WHERE sm.type <> 'RECEIVE' AND sm.unit_cost = 0 AND m.default_cost > 0;

SELECT ROW_COUNT() AS movements_recosted;

COMMIT;

-- 3. Still to fill in by hand.
SELECT id, name, spec, unit, category FROM materials WHERE default_cost = 0 ORDER BY name;

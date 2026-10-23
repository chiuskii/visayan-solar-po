-- Client prices: each job order line keeps its own unit price, so later changes to a material's cost
-- in Materials don't change what was already assigned to clients. The price can be edited per client
-- on the job order, and its assignment and return movements follow it.
ALTER TABLE `job_order_items` ADD COLUMN `unit_cost` decimal(14,2) NOT NULL DEFAULT 0 AFTER `quantity`;

START TRANSACTION;

-- Existing lines: the cost they went out at, else the material's cost today.
UPDATE job_order_items i
JOIN materials m ON m.id = i.material_id
SET i.unit_cost = COALESCE(
	(SELECT MAX(sm.unit_cost) FROM stock_movements sm
	 WHERE sm.job_order_id = i.job_order_id AND sm.material_id = i.material_id AND sm.type = 'ISSUE' AND sm.unit_cost IS NOT NULL),
	m.default_cost
);

-- Assignments and returns on a job order are valued at its line's price.
UPDATE stock_movements sm
JOIN job_order_items i ON i.job_order_id = sm.job_order_id AND i.material_id = sm.material_id
SET sm.unit_cost = i.unit_cost
WHERE sm.type IN ('ISSUE', 'RETURN');

-- Older assignments without a job order keep today's cost from now on, instead of following Materials.
UPDATE stock_movements sm
JOIN materials m ON m.id = sm.material_id
SET sm.unit_cost = m.default_cost
WHERE sm.type IN ('ISSUE', 'RETURN') AND sm.unit_cost IS NULL;

COMMIT;

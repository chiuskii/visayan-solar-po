-- Gives the assignments made 8–17 Oct 2026, before job orders existed, real job order numbers.
-- Each assignment (one "Assign materials" save) wrote its movements in one statement, so they share
-- client, date, reference, notes, user and created_at; each such group becomes one job order.
-- Numbers continue after any job orders already numbered for 2026, in date order.
-- Runs in one transaction: if any step fails, nothing is changed.
START TRANSACTION;

SET @jo_base = CONCAT(COALESCE((SELECT jo_prefix FROM company_settings WHERE id = 1), 'VS-JO'), '-2026-');
SET @jo_last = CAST(COALESCE(
	(SELECT MAX(CAST(SUBSTRING(jo_number, CHAR_LENGTH(@jo_base) + 1) AS UNSIGNED)) FROM job_orders WHERE jo_number LIKE CONCAT(@jo_base, '%') FOR UPDATE),
	0
) AS UNSIGNED);

CREATE TEMPORARY TABLE `jo_backfill` (
	`client_id` int NULL,
	`movement_date` date NOT NULL,
	`reference` varchar(120) NULL,
	`notes` text NULL,
	`created_by_id` int NULL,
	`created_at` datetime NOT NULL,
	`first_id` int NOT NULL,
	`jo_number` varchar(40) NOT NULL
);
INSERT INTO `jo_backfill`
SELECT g.*, CONCAT(@jo_base, LPAD(CAST(@jo_last + ROW_NUMBER() OVER (ORDER BY g.movement_date, g.created_at, g.first_id) AS UNSIGNED), 4, '0'))
FROM (
	SELECT sm.client_id, sm.movement_date, sm.reference, sm.notes, sm.created_by_id, sm.created_at, MIN(sm.id) AS first_id
	FROM stock_movements sm
	WHERE sm.type = 'ISSUE' AND sm.job_order_id IS NULL AND sm.movement_date BETWEEN '2026-10-08' AND '2026-10-17'
	GROUP BY sm.client_id, sm.movement_date, sm.reference, sm.notes, sm.created_by_id, sm.created_at
) g;

INSERT INTO job_orders (jo_number, client_id, jo_date, status, reference, notes, created_by_id, created_at)
SELECT b.jo_number, b.client_id, b.movement_date, 'ISSUED', b.reference, b.notes, b.created_by_id, b.created_at
FROM jo_backfill b
ORDER BY b.jo_number;

-- Link each movement to its job order (NULL-safe matching on the grouping columns).
UPDATE stock_movements sm
JOIN jo_backfill b
	ON b.client_id <=> sm.client_id AND b.movement_date = sm.movement_date AND b.reference <=> sm.reference
	AND b.notes <=> sm.notes AND b.created_by_id <=> sm.created_by_id AND b.created_at = sm.created_at
JOIN job_orders jo ON jo.jo_number = b.jo_number
SET sm.job_order_id = jo.id
WHERE sm.type = 'ISSUE' AND sm.job_order_id IS NULL AND sm.movement_date BETWEEN '2026-10-08' AND '2026-10-17';

-- Copy what was issued onto each job order, as new assignments do.
INSERT INTO job_order_items (job_order_id, material_id, description, spec, unit, quantity, sort_order)
SELECT sm.job_order_id, m.id, m.name, m.spec, m.unit, -sm.quantity,
	ROW_NUMBER() OVER (PARTITION BY sm.job_order_id ORDER BY sm.id) - 1
FROM stock_movements sm
JOIN materials m ON m.id = sm.material_id
WHERE sm.type = 'ISSUE'
	AND sm.job_order_id IN (SELECT jo.id FROM job_orders jo JOIN jo_backfill b ON b.jo_number = jo.jo_number);

DROP TEMPORARY TABLE `jo_backfill`;

COMMIT;

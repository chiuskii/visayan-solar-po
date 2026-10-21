-- One job order per client. Until now each "Assign materials" save made its own job order, so a
-- client could have dozens. This merges each client's open (ISSUED) job orders into the oldest one,
-- which keeps its number: its items become one line per material (quantities added up), and the
-- stock movements and returns of the others move to it. The merged job orders are then deleted.
-- Cancelled job orders, and job orders without a client, are left as they are.
-- Runs in one transaction: if any step fails, nothing is changed.
START TRANSACTION;

-- Clients with more than one open job order, and the one each keeps.
CREATE TEMPORARY TABLE `jo_keep` (`client_id` int NOT NULL PRIMARY KEY, `keep_id` int NOT NULL);
INSERT INTO `jo_keep`
SELECT client_id, MIN(id) FROM job_orders
WHERE status = 'ISSUED' AND client_id IS NOT NULL
GROUP BY client_id HAVING COUNT(*) > 1;

-- The job orders folded into each kept one.
CREATE TEMPORARY TABLE `jo_merge` (`from_id` int NOT NULL PRIMARY KEY, `from_number` varchar(40) NOT NULL, `keep_id` int NOT NULL);
INSERT INTO `jo_merge`
SELECT jo.id, jo.jo_number, k.keep_id
FROM job_orders jo JOIN jo_keep k ON k.client_id = jo.client_id
WHERE jo.status = 'ISSUED' AND jo.id <> k.keep_id;

-- The kept job order is dated from the client's first assignment.
UPDATE job_orders k
JOIN (SELECT g.keep_id, MIN(jo.jo_date) AS first_date FROM jo_merge g JOIN job_orders jo ON jo.id = g.from_id GROUP BY g.keep_id) x ON x.keep_id = k.id
SET k.jo_date = LEAST(k.jo_date, x.first_date);

-- Movements that showed the old job order's number as their reference now show the kept one's.
UPDATE stock_movements sm
JOIN jo_merge g ON g.from_id = sm.job_order_id
JOIN job_orders k ON k.id = g.keep_id
SET sm.reference = COALESCE(k.reference, k.jo_number)
WHERE sm.reference = g.from_number;

-- Movements (assignments and returns) and items move to the kept job order.
UPDATE stock_movements sm JOIN jo_merge g ON g.from_id = sm.job_order_id SET sm.job_order_id = g.keep_id;
UPDATE job_order_items i JOIN jo_merge g ON g.from_id = i.job_order_id SET i.job_order_id = g.keep_id;

-- One line per material on each kept job order: the first line gets the total, the others go.
CREATE TEMPORARY TABLE `jo_lines` (`keep_line` int NOT NULL PRIMARY KEY, `job_order_id` int NOT NULL, `material_id` int NOT NULL, `qty` decimal(12,2) NOT NULL);
INSERT INTO `jo_lines`
SELECT MIN(i.id), i.job_order_id, i.material_id, SUM(i.quantity)
FROM job_order_items i JOIN jo_keep k ON k.keep_id = i.job_order_id
WHERE i.material_id IS NOT NULL
GROUP BY i.job_order_id, i.material_id;
UPDATE job_order_items i JOIN jo_lines l ON l.keep_line = i.id SET i.quantity = l.qty;
DELETE i FROM job_order_items i
JOIN jo_lines l ON l.job_order_id = i.job_order_id AND l.material_id = i.material_id
WHERE i.id <> l.keep_line;

-- Number the lines 0, 1, 2… in the order they were first assigned.
UPDATE job_order_items i
JOIN (
	SELECT x.id, ROW_NUMBER() OVER (PARTITION BY x.job_order_id ORDER BY x.id) - 1 AS rn
	FROM job_order_items x JOIN jo_keep k ON k.keep_id = x.job_order_id
) r ON r.id = i.id
SET i.sort_order = r.rn;

DELETE jo FROM job_orders jo JOIN jo_merge g ON g.from_id = jo.id;

DROP TEMPORARY TABLE `jo_lines`;
DROP TEMPORARY TABLE `jo_merge`;
DROP TEMPORARY TABLE `jo_keep`;

COMMIT;

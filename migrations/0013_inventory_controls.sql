-- Inventory controls: returns from job orders, a unit cost on every movement, reversals instead of
-- deletes, and who received the materials on a job order.
ALTER TABLE `stock_movements`
	MODIFY COLUMN `type` enum('RECEIVE','ISSUE','RETURN','ADJUST') NOT NULL,
	ADD COLUMN `unit_cost` decimal(14,2) NULL AFTER `quantity`,
	ADD COLUMN `reversal_of_id` int NULL AFTER `job_order_id`,
	-- A movement can be reversed once.
	ADD CONSTRAINT `stock_movements_reversal_unique` UNIQUE (`reversal_of_id`),
	ADD CONSTRAINT `stock_movements_reversal_fk` FOREIGN KEY (`reversal_of_id`) REFERENCES `stock_movements`(`id`) ON DELETE SET NULL;

ALTER TABLE `job_orders` ADD COLUMN `received_by` varchar(120) NULL AFTER `reference`;

-- Backfill costs: receipts at their PO price, everything else at today's default cost.
UPDATE stock_movements sm JOIN po_items pi ON pi.id = sm.po_item_id
SET sm.unit_cost = pi.unit_cost
WHERE sm.type = 'RECEIVE';
UPDATE stock_movements sm JOIN materials m ON m.id = sm.material_id
SET sm.unit_cost = m.default_cost
WHERE sm.unit_cost IS NULL;

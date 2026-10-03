-- Inventory: stock on hand per material, kept as a ledger of movements.
-- On hand = SUM(quantity): RECEIVE (+) from warehouse PO deliveries, ISSUE (-) to a client/project,
-- ADJUST (+/-) for counts and corrections.

-- POs delivered to the warehouse add their received quantities to stock.
ALTER TABLE `purchase_orders` ADD COLUMN `to_warehouse` boolean NOT NULL DEFAULT false AFTER `status`;

-- Flag a material as low when on hand falls to this level (0 = no alert).
ALTER TABLE `materials` ADD COLUMN `reorder_level` decimal(12,2) NOT NULL DEFAULT 0 AFTER `default_supplier_id`;

CREATE TABLE `stock_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`material_id` int NOT NULL,
	`type` enum('RECEIVE','ISSUE','ADJUST') NOT NULL,
	`quantity` decimal(12,2) NOT NULL,
	`movement_date` date NOT NULL,
	`delivery_id` int,
	`po_item_id` int,
	`client_id` int,
	`reference` varchar(120),
	`notes` text,
	`created_by_id` int,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `stock_movements_id` PRIMARY KEY(`id`)
);
CREATE INDEX `stock_movements_material_idx` ON `stock_movements` (`material_id`, `movement_date`);
CREATE INDEX `stock_movements_delivery_idx` ON `stock_movements` (`delivery_id`);
CREATE INDEX `stock_movements_po_item_idx` ON `stock_movements` (`po_item_id`);
CREATE INDEX `stock_movements_client_idx` ON `stock_movements` (`client_id`);
CREATE INDEX `stock_movements_created_by_idx` ON `stock_movements` (`created_by_id`);
-- A material with stock history can't be deleted.
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_material_id_materials_id_fk` FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON DELETE restrict ON UPDATE no action;
-- Removing a delivery (or its PO line) removes the stock it added.
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_delivery_id_deliveries_id_fk` FOREIGN KEY (`delivery_id`) REFERENCES `deliveries`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_po_item_id_po_items_id_fk` FOREIGN KEY (`po_item_id`) REFERENCES `po_items`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE set null ON UPDATE no action;
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_created_by_id_users_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;

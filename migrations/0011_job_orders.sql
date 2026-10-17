-- Job orders: created automatically each time materials are assigned (issued) to a client / project.
-- Items are copied onto the job order so it still prints in full after the movement log is cleared.
CREATE TABLE `job_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jo_number` varchar(40) NOT NULL,
	`client_id` int NULL,
	`jo_date` date NOT NULL,
	`status` enum('ISSUED','CANCELLED') NOT NULL DEFAULT 'ISSUED',
	`reference` varchar(120) NULL,
	`notes` text NULL,
	`created_by_id` int NULL,
	`cancelled_by_id` int NULL,
	`cancelled_at` datetime NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `job_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `job_orders_number_unique` UNIQUE(`jo_number`),
	CONSTRAINT `job_orders_client_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE SET NULL,
	CONSTRAINT `job_orders_created_by_fk` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
	CONSTRAINT `job_orders_cancelled_by_fk` FOREIGN KEY (`cancelled_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE INDEX `job_orders_client_idx` ON `job_orders` (`client_id`, `jo_date`);

CREATE TABLE `job_order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`job_order_id` int NOT NULL,
	`material_id` int NULL,
	`description` varchar(255) NOT NULL,
	`spec` varchar(255) NULL,
	`unit` varchar(40) NOT NULL,
	`quantity` decimal(12,2) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `job_order_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `job_order_items_jo_fk` FOREIGN KEY (`job_order_id`) REFERENCES `job_orders`(`id`) ON DELETE CASCADE,
	CONSTRAINT `job_order_items_material_fk` FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON DELETE SET NULL
);

-- The stock movements a job order made, so they can be linked and reversed if it's cancelled.
ALTER TABLE `stock_movements` ADD COLUMN `job_order_id` int NULL AFTER `client_id`;
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_job_order_fk` FOREIGN KEY (`job_order_id`) REFERENCES `job_orders`(`id`) ON DELETE SET NULL;

ALTER TABLE `company_settings` ADD COLUMN `jo_prefix` varchar(20) NOT NULL DEFAULT 'VS-JO' AFTER `po_prefix`;

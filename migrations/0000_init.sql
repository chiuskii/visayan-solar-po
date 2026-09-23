CREATE TABLE `clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(190) NOT NULL,
	`contact_person` varchar(120),
	`phone` varchar(60),
	`email` varchar(190),
	`address` text,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clients_id` PRIMARY KEY(`id`)
);

CREATE TABLE `company_settings` (
	`id` int NOT NULL,
	`company_name` varchar(190) NOT NULL DEFAULT 'Visayan Solar',
	`address` text,
	`phone` varchar(60),
	`email` varchar(190),
	`tin` varchar(40),
	`po_prefix` varchar(20) NOT NULL DEFAULT 'VS-PO',
	`default_terms` varchar(190),
	`po_footer` text,
	`approver_name` varchar(120),
	`approver_title` varchar(120),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `company_settings_id` PRIMARY KEY(`id`)
);

CREATE TABLE `deliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`po_id` int NOT NULL,
	`delivery_date` date NOT NULL,
	`dr_number` varchar(60),
	`received_by` varchar(120),
	`notes` text,
	`created_by_id` int,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `deliveries_id` PRIMARY KEY(`id`)
);

CREATE TABLE `delivery_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`delivery_id` int NOT NULL,
	`po_item_id` int NOT NULL,
	`quantity` decimal(12,2) NOT NULL,
	CONSTRAINT `delivery_items_id` PRIMARY KEY(`id`)
);

CREATE TABLE `materials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(190) NOT NULL,
	`spec` varchar(190),
	`category` varchar(80),
	`unit` varchar(30) NOT NULL DEFAULT 'pcs',
	`default_cost` decimal(14,2) NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `materials_id` PRIMARY KEY(`id`)
);

CREATE TABLE `po_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`po_id` int NOT NULL,
	`material_id` int,
	`description` varchar(255) NOT NULL,
	`spec` varchar(190),
	`unit` varchar(30) NOT NULL DEFAULT 'pcs',
	`quantity` decimal(12,2) NOT NULL,
	`unit_cost` decimal(14,2) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `po_items_id` PRIMARY KEY(`id`)
);

CREATE TABLE `purchase_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`po_number` varchar(40) NOT NULL,
	`client_id` int NOT NULL,
	`supplier_id` int NOT NULL,
	`po_date` date NOT NULL,
	`expected_date` date,
	`status` enum('DRAFT','ORDERED','PARTIAL','DELIVERED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
	`delivery_address` text,
	`terms` varchar(190),
	`vat_rate` decimal(5,2) NOT NULL DEFAULT 0,
	`discount` decimal(14,2) NOT NULL DEFAULT 0,
	`notes` text,
	`created_by_id` int,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchase_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `purchase_orders_po_number_unique` UNIQUE(`po_number`)
);

CREATE TABLE `suppliers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(190) NOT NULL,
	`contact_person` varchar(120),
	`phone` varchar(60),
	`email` varchar(190),
	`address` text,
	`tin` varchar(40),
	`payment_terms` varchar(120),
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `suppliers_id` PRIMARY KEY(`id`)
);

CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`email` varchar(190) NOT NULL,
	`password_hash` varchar(100) NOT NULL,
	`role` enum('ADMIN','STAFF') NOT NULL DEFAULT 'STAFF',
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);

ALTER TABLE `deliveries` ADD CONSTRAINT `deliveries_po_id_purchase_orders_id_fk` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `deliveries` ADD CONSTRAINT `deliveries_created_by_id_users_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
ALTER TABLE `delivery_items` ADD CONSTRAINT `delivery_items_delivery_id_deliveries_id_fk` FOREIGN KEY (`delivery_id`) REFERENCES `deliveries`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `delivery_items` ADD CONSTRAINT `delivery_items_po_item_id_po_items_id_fk` FOREIGN KEY (`po_item_id`) REFERENCES `po_items`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `po_items` ADD CONSTRAINT `po_items_po_id_purchase_orders_id_fk` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `po_items` ADD CONSTRAINT `po_items_material_id_materials_id_fk` FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON DELETE set null ON UPDATE no action;
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE restrict ON UPDATE no action;
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_supplier_id_suppliers_id_fk` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE restrict ON UPDATE no action;
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_created_by_id_users_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
CREATE INDEX `clients_name_idx` ON `clients` (`name`);
CREATE INDEX `deliveries_po_idx` ON `deliveries` (`po_id`);
CREATE INDEX `delivery_items_delivery_idx` ON `delivery_items` (`delivery_id`);
CREATE INDEX `delivery_items_item_idx` ON `delivery_items` (`po_item_id`);
CREATE INDEX `materials_name_idx` ON `materials` (`name`);
CREATE INDEX `po_items_po_idx` ON `po_items` (`po_id`);
CREATE INDEX `po_client_idx` ON `purchase_orders` (`client_id`);
CREATE INDEX `po_supplier_idx` ON `purchase_orders` (`supplier_id`);
CREATE INDEX `po_status_idx` ON `purchase_orders` (`status`);
CREATE INDEX `suppliers_name_idx` ON `suppliers` (`name`);
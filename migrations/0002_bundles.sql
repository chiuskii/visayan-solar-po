-- Bundles: saved sets of material lines (e.g. an "8kW system" kit) that can be
-- added to a PO in one step. Adding a bundle copies its lines onto the PO.

CREATE TABLE `bundles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(190) NOT NULL,
	`description` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bundles_id` PRIMARY KEY(`id`)
);
CREATE INDEX `bundles_name_idx` ON `bundles` (`name`);

CREATE TABLE `bundle_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bundle_id` int NOT NULL,
	`supplier_id` int,
	`material_id` int,
	`description` varchar(255) NOT NULL,
	`spec` varchar(190),
	`unit` varchar(30) NOT NULL DEFAULT 'pcs',
	`quantity` decimal(12,2) NOT NULL,
	`unit_cost` decimal(14,2) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `bundle_items_id` PRIMARY KEY(`id`)
);
CREATE INDEX `bundle_items_bundle_idx` ON `bundle_items` (`bundle_id`);
CREATE INDEX `bundle_items_supplier_idx` ON `bundle_items` (`supplier_id`);
CREATE INDEX `bundle_items_material_idx` ON `bundle_items` (`material_id`);
ALTER TABLE `bundle_items` ADD CONSTRAINT `bundle_items_bundle_id_bundles_id_fk` FOREIGN KEY (`bundle_id`) REFERENCES `bundles`(`id`) ON DELETE cascade ON UPDATE no action;
-- A deleted supplier or material leaves the bundle line in place (supplier then needs choosing on the PO).
ALTER TABLE `bundle_items` ADD CONSTRAINT `bundle_items_supplier_id_suppliers_id_fk` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE set null ON UPDATE no action;
ALTER TABLE `bundle_items` ADD CONSTRAINT `bundle_items_material_id_materials_id_fk` FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON DELETE set null ON UPDATE no action;

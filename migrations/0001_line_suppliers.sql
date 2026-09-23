-- Each PO line now has its own supplier (a PO can buy from several suppliers),
-- and each material can remember a default supplier.

-- 1. po_items.supplier_id, filled from the PO's old header supplier.
ALTER TABLE `po_items` ADD COLUMN `supplier_id` int NULL AFTER `po_id`;
UPDATE `po_items` pi JOIN `purchase_orders` po ON po.`id` = pi.`po_id` SET pi.`supplier_id` = po.`supplier_id`;
ALTER TABLE `po_items` MODIFY `supplier_id` int NOT NULL;
CREATE INDEX `po_items_supplier_idx` ON `po_items` (`supplier_id`);
ALTER TABLE `po_items` ADD CONSTRAINT `po_items_supplier_id_suppliers_id_fk` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE restrict ON UPDATE no action;

-- 2. Drop the header supplier from purchase_orders.
ALTER TABLE `purchase_orders` DROP FOREIGN KEY `purchase_orders_supplier_id_suppliers_id_fk`;
DROP INDEX `po_supplier_idx` ON `purchase_orders`;
ALTER TABLE `purchase_orders` DROP COLUMN `supplier_id`;

-- 3. materials.default_supplier_id
ALTER TABLE `materials` ADD COLUMN `default_supplier_id` int NULL AFTER `default_cost`;
CREATE INDEX `materials_default_supplier_idx` ON `materials` (`default_supplier_id`);
ALTER TABLE `materials` ADD CONSTRAINT `materials_default_supplier_id_suppliers_id_fk` FOREIGN KEY (`default_supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE set null ON UPDATE no action;

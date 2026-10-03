-- PO approval: users have a designation and may be approvers. A PO is submitted for approval
-- (status PENDING); an approver reviews it, then approves (→ ORDERED, signed with their
-- e-signature) or returns it to draft with a note.

ALTER TABLE `users` ADD COLUMN `designation` varchar(120) NULL AFTER `name`;
ALTER TABLE `users` ADD COLUMN `can_approve` boolean NOT NULL DEFAULT false AFTER `role`;

ALTER TABLE `purchase_orders` MODIFY `status` enum('DRAFT','PENDING','ORDERED','PARTIAL','DELIVERED','CANCELLED') NOT NULL DEFAULT 'DRAFT';
ALTER TABLE `purchase_orders` ADD COLUMN `submitted_at` timestamp NULL AFTER `created_by_id`;
ALTER TABLE `purchase_orders` ADD COLUMN `approved_by_id` int NULL AFTER `submitted_at`;
ALTER TABLE `purchase_orders` ADD COLUMN `approved_at` timestamp NULL AFTER `approved_by_id`;
ALTER TABLE `purchase_orders` ADD COLUMN `approval_note` text NULL AFTER `approved_at`;
CREATE INDEX `po_approved_by_idx` ON `purchase_orders` (`approved_by_id`);
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_approved_by_id_users_id_fk` FOREIGN KEY (`approved_by_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;

-- The approver is now the user who approves each PO, so the fixed approver in Settings goes.
ALTER TABLE `company_settings` ADD COLUMN `require_approval` boolean NOT NULL DEFAULT true AFTER `default_terms`;
ALTER TABLE `company_settings` DROP COLUMN `approver_name`, DROP COLUMN `approver_title`, DROP COLUMN `approver_signature`;

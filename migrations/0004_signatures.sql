-- E-signatures printed on POs: each user's own (for "Prepared by") and the approver's
-- (for "Approved by"), stored as PNG/JPEG data URLs.
ALTER TABLE `users` ADD COLUMN `signature` mediumtext NULL AFTER `active`;
ALTER TABLE `company_settings` ADD COLUMN `approver_signature` mediumtext NULL AFTER `approver_title`;
-- Whether printed POs show e-signatures by default (can be switched off per print).
ALTER TABLE `company_settings` ADD COLUMN `show_signatures` boolean NOT NULL DEFAULT true AFTER `approver_signature`;

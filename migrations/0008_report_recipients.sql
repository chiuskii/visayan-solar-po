-- Who receives the emailed stock report (comma-separated addresses, set in Settings).
ALTER TABLE `company_settings` ADD COLUMN `report_recipients` text NULL AFTER `stock_cleared_delivery_id`;

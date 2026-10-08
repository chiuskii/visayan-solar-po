-- Clearing the stock movement log (admin) replaces it with one opening-balance adjustment per
-- material. Deliveries recorded before the clear are already counted in those balances, so
-- stock is only rebuilt from deliveries with an id above this cut-off.
ALTER TABLE `company_settings` ADD COLUMN `stock_cleared_delivery_id` int NOT NULL DEFAULT 0 AFTER `show_signatures`;

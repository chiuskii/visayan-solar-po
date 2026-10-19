-- ONE-TIME: switch stock IN to PO deliveries.
--
-- Until now stock came in through counts, so the deliveries recorded on POs describe stock that is
-- already in the counted balances. This marks every delivery recorded so far as "before PO receiving"
-- and removes the stock receipts they created, so they don't add the same stock a second time.
-- From then on, each new delivery on a warehouse PO adds stock at the PO price.
--
-- Order:
--   1. Record the deliveries already received on the old POs (DR no., quantities, received by).
--   2. Back up the database, then run this script once.
--   3. Do a full stock count straight after (Inventory → Stock count), so on-hand matches the shelves.
--
-- Run on the NAS, from the app folder:
--   docker compose -f docker-compose.prod.yml --env-file .env exec -T db \
--     sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' < scripts/one-time/po-receiving-cutover.sql
--
-- It refuses to run twice: a second run would also wipe receipts from real deliveries made since.

CREATE TABLE IF NOT EXISTS `one_time_scripts` (
	`name` varchar(120) NOT NULL PRIMARY KEY,
	`ran_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`note` text NULL
);

START TRANSACTION;

-- Fails with "Duplicate entry" (and changes nothing) if this has already been run.
INSERT INTO one_time_scripts (name) VALUES ('po-receiving-cutover');

SET @cutover_delivery_id = (SELECT COALESCE(MAX(id), 0) FROM deliveries);

SELECT
	@cutover_delivery_id AS deliveries_up_to_id,
	(SELECT COUNT(*) FROM stock_movements sm JOIN deliveries d ON d.id = sm.delivery_id
	 WHERE sm.type = 'RECEIVE' AND d.id <= @cutover_delivery_id) AS receipts_removed,
	(SELECT COALESCE(SUM(sm.quantity), 0) FROM stock_movements sm JOIN deliveries d ON d.id = sm.delivery_id
	 WHERE sm.type = 'RECEIVE' AND d.id <= @cutover_delivery_id) AS quantity_removed;

INSERT IGNORE INTO company_settings (id, company_name) VALUES (1, 'Visayan Solar Ventures Corporation');
UPDATE company_settings SET stock_cleared_delivery_id = GREATEST(stock_cleared_delivery_id, @cutover_delivery_id) WHERE id = 1;

DELETE sm FROM stock_movements sm
JOIN deliveries d ON d.id = sm.delivery_id
WHERE sm.type = 'RECEIVE' AND d.id <= @cutover_delivery_id;

UPDATE one_time_scripts
SET note = CONCAT('Deliveries up to id ', @cutover_delivery_id, ' are from before PO receiving.')
WHERE name = 'po-receiving-cutover';

COMMIT;

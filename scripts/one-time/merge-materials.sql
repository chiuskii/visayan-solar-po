-- Merges duplicate materials: everything that points at the duplicate is moved to the one you keep,
-- then the duplicate is deleted.
--
-- Each merge is one CALL:  CALL merge_material(keep_id, 'keep name', dup_id, 'dup name', factor);
--   * The names must match the ids (case doesn't matter). A wrong id stops the whole script and
--     nothing is changed, so a typo can't merge the wrong materials.
--   * factor = how many of the KEPT material's unit one unit of the duplicate is. Use 1 when the
--     units are the same. Example: keep "Battery Wire 50mm" in m, duplicate in pc where 1 pc = 100 m
--     → factor 100. The script refuses different units with factor 1.
--
-- What moves to the kept material:
--   stock movements (quantities × factor, unit cost ÷ factor) and bundle items (converted the same way).
--   PO lines and job order lines are relinked only: the PO stays as it was sent to the supplier, and
--   what was assigned to clients keeps its own name, unit, quantity and price.
--   The kept material also takes the duplicate's default cost, default supplier, category and spec
--   where its own are empty, and the higher reorder level.
-- When the units differ, the duplicate must not be on a PO that can still receive (not Delivered or
-- Cancelled), on deliveries after the PO receiving cutover, or on an open job order: those would mix
-- the two units.
--
-- Find the pairs with find-duplicate-materials.sql. Back up the database, then run:
--   docker compose -f docker-compose.prod.yml --env-file .env exec -T db \
--     sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" --table' < scripts/one-time/merge-materials.sql

DROP PROCEDURE IF EXISTS merge_material;

DELIMITER //
CREATE PROCEDURE merge_material(p_keep INT, p_keep_name VARCHAR(190), p_dup INT, p_dup_name VARCHAR(190), p_factor DECIMAL(14,4))
BEGIN
	DECLARE v_keep_name, v_dup_name VARCHAR(190);
	DECLARE v_keep_unit, v_dup_unit VARCHAR(30);
	DECLARE v_msg VARCHAR(128); -- MySQL error messages are at most 128 characters

	IF p_keep = p_dup THEN
		SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Keep and duplicate are the same id.';
	END IF;
	IF p_factor IS NULL OR p_factor <= 0 THEN
		SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The factor must be more than 0.';
	END IF;

	SELECT name, unit INTO v_keep_name, v_keep_unit FROM materials WHERE id = p_keep FOR UPDATE;
	SELECT name, unit INTO v_dup_name, v_dup_unit FROM materials WHERE id = p_dup FOR UPDATE;
	IF v_keep_name IS NULL OR LOWER(TRIM(v_keep_name)) <> LOWER(TRIM(p_keep_name)) THEN
		SET v_msg = LEFT(CONCAT('Material ', p_keep, ' is "', COALESCE(v_keep_name, 'not found'), '", not "', p_keep_name, '".'), 128);
		SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
	END IF;
	IF v_dup_name IS NULL OR LOWER(TRIM(v_dup_name)) <> LOWER(TRIM(p_dup_name)) THEN
		SET v_msg = LEFT(CONCAT('Material ', p_dup, ' is "', COALESCE(v_dup_name, 'not found'), '", not "', p_dup_name, '".'), 128);
		SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
	END IF;

	-- "pc" and "pcs" (and other plurals) count as the same unit.
	IF TRIM(TRAILING 's' FROM LOWER(TRIM(v_keep_unit))) <> TRIM(TRAILING 's' FROM LOWER(TRIM(v_dup_unit))) THEN
		IF p_factor = 1 THEN
			SET v_msg = LEFT(CONCAT('Units differ (', v_dup_unit, ' vs ', v_keep_unit, '): give a factor, ', v_keep_unit, ' per ', v_dup_unit, '. Material ', p_dup, '.'), 128);
			SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
		END IF;
		IF EXISTS (
			SELECT 1 FROM po_items pi JOIN purchase_orders po ON po.id = pi.po_id
			WHERE pi.material_id = p_dup AND po.status NOT IN ('DELIVERED', 'CANCELLED')
		) OR EXISTS (
			SELECT 1 FROM delivery_items di JOIN po_items pi ON pi.id = di.po_item_id
			WHERE pi.material_id = p_dup
			  AND di.delivery_id > (SELECT stock_cleared_delivery_id FROM company_settings WHERE id = 1)
		) OR EXISTS (
			SELECT 1 FROM job_order_items i JOIN job_orders jo ON jo.id = i.job_order_id
			WHERE i.material_id = p_dup AND jo.status <> 'CANCELLED'
		) THEN
			SET v_msg = LEFT(CONCAT('Material ', p_dup, ' is on an open PO, job order or a delivery since the cutover, and units differ.'), 128);
			SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
		END IF;
	ELSEIF p_factor <> 1 THEN
		SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The units are the same, so the factor must be 1.';
	END IF;

	UPDATE stock_movements
	SET material_id = p_keep, quantity = ROUND(quantity * p_factor, 2), unit_cost = ROUND(unit_cost / p_factor, 2)
	WHERE material_id = p_dup;
	UPDATE bundle_items
	SET material_id = p_keep, quantity = ROUND(quantity * p_factor, 2), unit_cost = ROUND(unit_cost / p_factor, 2), unit = v_keep_unit
	WHERE material_id = p_dup;
	UPDATE job_order_items SET material_id = p_keep WHERE material_id = p_dup;
	UPDATE po_items SET material_id = p_keep WHERE material_id = p_dup;

	UPDATE materials k JOIN materials d ON d.id = p_dup
	SET k.default_cost = IF(k.default_cost = 0, ROUND(d.default_cost / p_factor, 2), k.default_cost),
	    k.default_supplier_id = COALESCE(k.default_supplier_id, d.default_supplier_id),
	    k.category = COALESCE(k.category, d.category),
	    k.spec = COALESCE(k.spec, d.spec),
	    k.reorder_level = GREATEST(k.reorder_level, ROUND(d.reorder_level * p_factor, 2))
	WHERE k.id = p_keep;
	DELETE FROM materials WHERE id = p_dup;

	SELECT p_keep AS kept_id, v_keep_name AS kept, p_dup AS merged_id, v_dup_name AS merged, p_factor AS factor,
	       (SELECT COALESCE(SUM(quantity), 0) FROM stock_movements WHERE material_id = p_keep) AS on_hand_now;
END //
DELIMITER ;

START TRANSACTION;

-- One line per pair: CALL merge_material(keep_id, 'keep name', dup_id, 'dup name', factor);
-- Ids from the inventory controls plan; check them (and the exact names) with find-duplicate-materials.sql.
CALL merge_material(59, 'Aluminium Rails', 25, 'Aluminum Rail', 1);
CALL merge_material(61, 'AC MCB 100A', 86, 'AC MCB 100A', 1);
-- Fill in the ids for these from find-duplicate-materials.sql, then uncomment:
-- CALL merge_material(?, 'L-Foot', ?, 'L-foot', 1);
-- CALL merge_material(?, 'Mid Clamp', ?, 'Midclamp', 1);
-- CALL merge_material(?, 'End Clamp', ?, 'Endclamp', 1);
-- CALL merge_material(45, 'PVC Pipe 1', ?, 'Pvc Pipe 1', 1);
-- CALL merge_material(57, 'Inverter 6kW Deye', ?, 'Deye 6kw Inverter', 1);
-- Units differ (pc vs m): set the factor to how many m one "pc" is before uncommenting.
-- CALL merge_material(43, 'Battery Wire 50mm B/R', 105, 'BATTERY WIRE BLACK AND RED 50MM', ?);

COMMIT;

DROP PROCEDURE IF EXISTS merge_material;

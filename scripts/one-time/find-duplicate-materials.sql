-- Read-only: lists materials that look like duplicates (same name and spec once case, spaces,
-- hyphens, dots and "aluminium/aluminum" are ignored), with each one's unit and what uses it.
-- Use the ids it shows in merge-materials.sql. Changes nothing.
--
--   docker compose -f docker-compose.prod.yml --env-file .env exec -T db \
--     sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" --table' < scripts/one-time/find-duplicate-materials.sql

WITH keyed AS (
	SELECT m.*,
	       REGEXP_REPLACE(REPLACE(LOWER(CONCAT(m.name, ' ', COALESCE(m.spec, ''))), 'aluminium', 'aluminum'), '[^a-z0-9]', '') AS k
	FROM materials m
)
SELECT k.k AS match_key, k.id, k.name, k.spec, k.unit, k.default_cost,
       (SELECT COALESCE(SUM(quantity), 0) FROM stock_movements WHERE material_id = k.id) AS on_hand,
       (SELECT COUNT(*) FROM stock_movements WHERE material_id = k.id) AS movements,
       (SELECT COUNT(*) FROM po_items WHERE material_id = k.id) AS po_lines
FROM keyed k
WHERE k.k IN (SELECT k FROM keyed GROUP BY k HAVING COUNT(*) > 1)
ORDER BY k.k, k.id;

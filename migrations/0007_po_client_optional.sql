-- POs are now ordered straight from suppliers (usually into the warehouse); materials are
-- assigned to clients when they're issued from Inventory. A PO's client becomes optional,
-- and existing POs keep theirs.
ALTER TABLE `purchase_orders` MODIFY `client_id` int NULL;

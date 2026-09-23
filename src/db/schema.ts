import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  decimal,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

const timestamps = {
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
    .onUpdateNow(),
};

const money = (name: string) => decimal(name, { precision: 14, scale: 2, mode: "number" });
const qty = (name: string) => decimal(name, { precision: 12, scale: 2, mode: "number" });

export const ROLES = ["ADMIN", "STAFF"] as const;
export type Role = (typeof ROLES)[number];

export const PO_STATUSES = ["DRAFT", "ORDERED", "PARTIAL", "DELIVERED", "CANCELLED"] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 190 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 100 }).notNull(),
  role: mysqlEnum("role", ROLES).notNull().default("STAFF"),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const clients = mysqlTable(
  "clients",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 190 }).notNull(),
    contactPerson: varchar("contact_person", { length: 120 }),
    phone: varchar("phone", { length: 60 }),
    email: varchar("email", { length: 190 }),
    address: text("address"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("clients_name_idx").on(t.name)],
);

export const suppliers = mysqlTable(
  "suppliers",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 190 }).notNull(),
    contactPerson: varchar("contact_person", { length: 120 }),
    phone: varchar("phone", { length: 60 }),
    email: varchar("email", { length: 190 }),
    address: text("address"),
    tin: varchar("tin", { length: 40 }),
    paymentTerms: varchar("payment_terms", { length: 120 }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("suppliers_name_idx").on(t.name)],
);

export const materials = mysqlTable(
  "materials",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 190 }).notNull(),
    spec: varchar("spec", { length: 190 }),
    category: varchar("category", { length: 80 }),
    unit: varchar("unit", { length: 30 }).notNull().default("pcs"),
    defaultCost: money("default_cost").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("materials_name_idx").on(t.name)],
);

export const purchaseOrders = mysqlTable(
  "purchase_orders",
  {
    id: int("id").autoincrement().primaryKey(),
    poNumber: varchar("po_number", { length: 40 }).notNull().unique(),
    clientId: int("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    supplierId: int("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    poDate: date("po_date", { mode: "string" }).notNull(),
    expectedDate: date("expected_date", { mode: "string" }),
    status: mysqlEnum("status", PO_STATUSES).notNull().default("DRAFT"),
    deliveryAddress: text("delivery_address"),
    terms: varchar("terms", { length: 190 }),
    vatRate: decimal("vat_rate", { precision: 5, scale: 2, mode: "number" }).notNull().default(0),
    discount: money("discount").notNull().default(0),
    notes: text("notes"),
    createdById: int("created_by_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("po_client_idx").on(t.clientId),
    index("po_supplier_idx").on(t.supplierId),
    index("po_status_idx").on(t.status),
  ],
);

export const poItems = mysqlTable(
  "po_items",
  {
    id: int("id").autoincrement().primaryKey(),
    poId: int("po_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    materialId: int("material_id").references(() => materials.id, { onDelete: "set null" }),
    description: varchar("description", { length: 255 }).notNull(),
    spec: varchar("spec", { length: 190 }),
    unit: varchar("unit", { length: 30 }).notNull().default("pcs"),
    quantity: qty("quantity").notNull(),
    unitCost: money("unit_cost").notNull(),
    sortOrder: int("sort_order").notNull().default(0),
  },
  (t) => [index("po_items_po_idx").on(t.poId)],
);

export const deliveries = mysqlTable(
  "deliveries",
  {
    id: int("id").autoincrement().primaryKey(),
    poId: int("po_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    deliveryDate: date("delivery_date", { mode: "string" }).notNull(),
    drNumber: varchar("dr_number", { length: 60 }),
    receivedBy: varchar("received_by", { length: 120 }),
    notes: text("notes"),
    createdById: int("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("deliveries_po_idx").on(t.poId)],
);

export const deliveryItems = mysqlTable(
  "delivery_items",
  {
    id: int("id").autoincrement().primaryKey(),
    deliveryId: int("delivery_id")
      .notNull()
      .references(() => deliveries.id, { onDelete: "cascade" }),
    poItemId: int("po_item_id")
      .notNull()
      .references(() => poItems.id, { onDelete: "cascade" }),
    quantity: qty("quantity").notNull(),
  },
  (t) => [index("delivery_items_delivery_idx").on(t.deliveryId), index("delivery_items_item_idx").on(t.poItemId)],
);

// Company details printed on every PO. Single row (id = 1), edited on the Settings page.
export const companySettings = mysqlTable("company_settings", {
  id: int("id").primaryKey(),
  companyName: varchar("company_name", { length: 190 }).notNull().default("Visayan Solar"),
  address: text("address"),
  phone: varchar("phone", { length: 60 }),
  email: varchar("email", { length: 190 }),
  tin: varchar("tin", { length: 40 }),
  poPrefix: varchar("po_prefix", { length: 20 }).notNull().default("VS-PO"),
  defaultTerms: varchar("default_terms", { length: 190 }),
  poFooter: text("po_footer"),
  approverName: varchar("approver_name", { length: 120 }),
  approverTitle: varchar("approver_title", { length: 120 }),
  updatedAt: timestamp("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
    .onUpdateNow(),
});

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  client: one(clients, { fields: [purchaseOrders.clientId], references: [clients.id] }),
  supplier: one(suppliers, { fields: [purchaseOrders.supplierId], references: [suppliers.id] }),
  createdBy: one(users, { fields: [purchaseOrders.createdById], references: [users.id] }),
  items: many(poItems),
  deliveries: many(deliveries),
}));

export const poItemsRelations = relations(poItems, ({ one, many }) => ({
  po: one(purchaseOrders, { fields: [poItems.poId], references: [purchaseOrders.id] }),
  material: one(materials, { fields: [poItems.materialId], references: [materials.id] }),
  deliveryItems: many(deliveryItems),
}));

export const deliveriesRelations = relations(deliveries, ({ one, many }) => ({
  po: one(purchaseOrders, { fields: [deliveries.poId], references: [purchaseOrders.id] }),
  items: many(deliveryItems),
}));

export const deliveryItemsRelations = relations(deliveryItems, ({ one }) => ({
  delivery: one(deliveries, { fields: [deliveryItems.deliveryId], references: [deliveries.id] }),
  poItem: one(poItems, { fields: [deliveryItems.poItemId], references: [poItems.id] }),
}));

export const clientsRelations = relations(clients, ({ many }) => ({ purchaseOrders: many(purchaseOrders) }));
export const suppliersRelations = relations(suppliers, ({ many }) => ({ purchaseOrders: many(purchaseOrders) }));

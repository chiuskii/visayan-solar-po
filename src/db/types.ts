// Row types for the tables in migrations/*.sql, plus the column lists that map
// snake_case columns to the camelCase fields the app uses.

export const ROLES = ["ADMIN", "STAFF"] as const;
export type Role = (typeof ROLES)[number];

export const PO_STATUSES = ["DRAFT", "PENDING", "ORDERED", "PARTIAL", "DELIVERED", "CANCELLED"] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export type User = {
  id: number;
  name: string;
  /** Job title printed under the name, e.g. "Purchasing Officer". */
  designation: string | null;
  email: string;
  passwordHash: string;
  role: Role;
  /** May approve (and e-sign) purchase orders. */
  canApprove: boolean;
  active: boolean;
  /** PNG/JPEG data URL of the user's e-signature (printed as "Prepared by"). */
  signature: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Client = {
  id: number;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Supplier = {
  id: number;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tin: string | null;
  paymentTerms: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Material = {
  id: number;
  name: string;
  spec: string | null;
  category: string | null;
  unit: string;
  defaultCost: number;
  defaultSupplierId: number | null;
  reorderLevel: number;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseOrder = {
  id: number;
  poNumber: string;
  clientId: number;
  poDate: string;
  expectedDate: string | null;
  status: PoStatus;
  toWarehouse: boolean;
  deliveryAddress: string | null;
  terms: string | null;
  vatRate: number;
  discount: number;
  notes: string | null;
  createdById: number | null;
  submittedAt: string | null;
  approvedById: number | null;
  approvedAt: string | null;
  /** Approver's note when a PO is returned to draft. */
  approvalNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PoItem = {
  id: number;
  poId: number;
  supplierId: number;
  materialId: number | null;
  description: string;
  spec: string | null;
  unit: string;
  quantity: number;
  unitCost: number;
  sortOrder: number;
};

export type Delivery = {
  id: number;
  poId: number;
  deliveryDate: string;
  drNumber: string | null;
  receivedBy: string | null;
  notes: string | null;
  createdById: number | null;
  createdAt: string;
};

export type Bundle = {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BundleItem = {
  id: number;
  bundleId: number;
  supplierId: number | null;
  materialId: number | null;
  description: string;
  spec: string | null;
  unit: string;
  quantity: number;
  unitCost: number;
  sortOrder: number;
};

export const STOCK_TYPES = ["RECEIVE", "ISSUE", "ADJUST"] as const;
export type StockType = (typeof STOCK_TYPES)[number];

export type StockMovement = {
  id: number;
  materialId: number;
  type: StockType;
  /** Positive adds to stock, negative takes from it. */
  quantity: number;
  movementDate: string;
  deliveryId: number | null;
  poItemId: number | null;
  clientId: number | null;
  reference: string | null;
  notes: string | null;
  createdById: number | null;
  createdAt: string;
};

export type CompanySettings = {
  id: number;
  companyName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  tin: string | null;
  poPrefix: string;
  defaultTerms: string | null;
  poFooter: string | null;
  /** POs must be approved before they're ordered. */
  requireApproval: boolean;
  showSignatures: boolean;
  /** Deliveries up to this id are already in the opening balances from the last log clear. */
  stockClearedDeliveryId: number;
  updatedAt: string;
};

/** camelCase field → column name, per table. Used to build SELECT lists and INSERT/UPDATE statements. */
export const COLUMNS = {
  users: {
    id: "id", name: "name", designation: "designation", email: "email", passwordHash: "password_hash", role: "role",
    canApprove: "can_approve", active: "active", signature: "signature", createdAt: "created_at", updatedAt: "updated_at",
  },
  clients: { id: "id", name: "name", contactPerson: "contact_person", phone: "phone", email: "email", address: "address", notes: "notes", createdAt: "created_at", updatedAt: "updated_at" },
  suppliers: { id: "id", name: "name", contactPerson: "contact_person", phone: "phone", email: "email", address: "address", tin: "tin", paymentTerms: "payment_terms", notes: "notes", createdAt: "created_at", updatedAt: "updated_at" },
  materials: { id: "id", name: "name", spec: "spec", category: "category", unit: "unit", defaultCost: "default_cost", defaultSupplierId: "default_supplier_id", reorderLevel: "reorder_level", createdAt: "created_at", updatedAt: "updated_at" },
  purchase_orders: {
    id: "id", poNumber: "po_number", clientId: "client_id", poDate: "po_date", expectedDate: "expected_date",
    status: "status", toWarehouse: "to_warehouse", deliveryAddress: "delivery_address", terms: "terms", vatRate: "vat_rate", discount: "discount", notes: "notes",
    createdById: "created_by_id", submittedAt: "submitted_at", approvedById: "approved_by_id", approvedAt: "approved_at",
    approvalNote: "approval_note", createdAt: "created_at", updatedAt: "updated_at",
  },
  po_items: { id: "id", poId: "po_id", supplierId: "supplier_id", materialId: "material_id", description: "description", spec: "spec", unit: "unit", quantity: "quantity", unitCost: "unit_cost", sortOrder: "sort_order" },
  deliveries: { id: "id", poId: "po_id", deliveryDate: "delivery_date", drNumber: "dr_number", receivedBy: "received_by", notes: "notes", createdById: "created_by_id", createdAt: "created_at" },
  bundles: { id: "id", name: "name", description: "description", createdAt: "created_at", updatedAt: "updated_at" },
  bundle_items: {
    id: "id", bundleId: "bundle_id", supplierId: "supplier_id", materialId: "material_id", description: "description", spec: "spec",
    unit: "unit", quantity: "quantity", unitCost: "unit_cost", sortOrder: "sort_order",
  },
  stock_movements: {
    id: "id", materialId: "material_id", type: "type", quantity: "quantity", movementDate: "movement_date", deliveryId: "delivery_id",
    poItemId: "po_item_id", clientId: "client_id", reference: "reference", notes: "notes", createdById: "created_by_id", createdAt: "created_at",
  },
  company_settings: {
    id: "id", companyName: "company_name", address: "address", phone: "phone", email: "email", tin: "tin", poPrefix: "po_prefix",
    defaultTerms: "default_terms", requireApproval: "require_approval", poFooter: "po_footer", showSignatures: "show_signatures",
    stockClearedDeliveryId: "stock_cleared_delivery_id", updatedAt: "updated_at",
  },
} as const;

export type Table = keyof typeof COLUMNS;

/** `alias.col AS field, ...` for every column of a table, e.g. cols("clients", "c"). */
export function cols(table: Table, alias: string = table) {
  return Object.entries(COLUMNS[table])
    .map(([field, col]) => `${alias}.${col} AS ${field}`)
    .join(", ");
}

/** Turns camelCase values into a `{ column: value }` object for `INSERT ... SET ?` / `UPDATE ... SET ?`. */
export function toRow(table: Table, values: Record<string, unknown>) {
  const map = COLUMNS[table] as Record<string, string>;
  const row: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(values)) {
    if (value === undefined) continue;
    const col = map[field];
    if (!col) throw new Error(`Unknown column ${table}.${field}`);
    row[col] = value;
  }
  return row;
}

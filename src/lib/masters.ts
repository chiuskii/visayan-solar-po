// Field definitions for the simple master lists (clients, suppliers, materials).
export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "textarea" | "email" | "number";
  required?: boolean;
  placeholder?: string;
  wide?: boolean;
};

export type MasterKey = "clients" | "suppliers" | "materials";

export const MASTERS: Record<
  MasterKey,
  { title: string; singular: string; fields: FieldDef[]; columns: { name: string; label: string; money?: boolean }[] }
> = {
  clients: {
    title: "Clients",
    singular: "Client",
    fields: [
      { name: "name", label: "Client / company name", required: true, wide: true },
      { name: "contactPerson", label: "Contact person" },
      { name: "phone", label: "Phone" },
      { name: "email", label: "Email", type: "email" },
      { name: "address", label: "Project / site address", type: "textarea", wide: true },
      { name: "notes", label: "Notes", type: "textarea", wide: true },
    ],
    columns: [
      { name: "name", label: "Name" },
      { name: "contactPerson", label: "Contact" },
      { name: "phone", label: "Phone" },
      { name: "address", label: "Address" },
    ],
  },
  suppliers: {
    title: "Suppliers",
    singular: "Supplier",
    fields: [
      { name: "name", label: "Supplier name", required: true, wide: true },
      { name: "contactPerson", label: "Contact person" },
      { name: "phone", label: "Phone" },
      { name: "email", label: "Email", type: "email" },
      { name: "tin", label: "TIN" },
      { name: "paymentTerms", label: "Payment terms", placeholder: "e.g. 30 days, COD" },
      { name: "address", label: "Address", type: "textarea", wide: true },
      { name: "notes", label: "Notes", type: "textarea", wide: true },
    ],
    columns: [
      { name: "name", label: "Name" },
      { name: "contactPerson", label: "Contact" },
      { name: "phone", label: "Phone" },
      { name: "paymentTerms", label: "Terms" },
    ],
  },
  materials: {
    title: "Materials",
    singular: "Material",
    fields: [
      { name: "name", label: "Material name", required: true, wide: true, placeholder: "e.g. Solar panel, mono PERC" },
      { name: "spec", label: "Brand / spec", placeholder: "e.g. 550W" },
      { name: "category", label: "Category", placeholder: "e.g. Panels" },
      { name: "unit", label: "Unit", required: true, placeholder: "pcs, set, m, roll" },
      { name: "defaultCost", label: "Default unit cost (₱)", type: "number" },
    ],
    columns: [
      { name: "name", label: "Material" },
      { name: "spec", label: "Spec" },
      { name: "category", label: "Category" },
      { name: "unit", label: "Unit" },
      { name: "defaultCost", label: "Default cost", money: true },
    ],
  },
};

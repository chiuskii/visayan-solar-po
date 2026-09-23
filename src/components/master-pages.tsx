import Link from "next/link";
import { notFound } from "next/navigation";
import { importMasterCsv } from "@/app/actions/master-csv";
import { bulkDeleteMaster, bulkUpdateMaster, deleteMaster } from "@/app/actions/masters";
import { query, queryOne } from "@/db";
import { cols } from "@/db/types";
import { requireUser } from "@/lib/auth";
import { peso } from "@/lib/format";
import { csvColumn, MASTERS, type MasterKey } from "@/lib/masters";
import { BulkEditForm } from "./bulk-edit-form";
import { BulkSelect } from "./bulk-select";
import { ConfirmButton } from "./client-ui";
import { ImportForm } from "./import-form";
import { MasterForm } from "./master-form";
import { Empty, PageHeader } from "./ui";

const TABLES = { clients: "clients", suppliers: "suppliers", materials: "materials" } as const;

export async function MasterListPage({ entity, q, updated }: { entity: MasterKey; q?: string; updated?: string }) {
  await requireUser();
  const cfg = MASTERS[entity];
  const table = TABLES[entity];
  const search = (q ?? "").trim();
  const rows = await query<Record<string, unknown>>(
    `SELECT ${cols(table, "t")}${entity === "materials" ? ", s.name AS defaultSupplierName" : ""}
     FROM ${table} t
     ${entity === "materials" ? "LEFT JOIN suppliers s ON s.id = t.default_supplier_id" : ""}
     ${search ? "WHERE t.name LIKE ?" : ""}
     ORDER BY t.name
     LIMIT 500`,
    search ? [`%${search}%`] : [],
  );

  const listTable = (
    <div className="card overflow-x-auto">
      {rows.length === 0 ? (
        <Empty>
          No {cfg.title.toLowerCase()} yet. <Link className="text-brand-600 underline" href={`/${entity}/new`}>Add the first one</Link>.
        </Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              {cfg.bulk && (
                <th className="w-8">
                  <input type="checkbox" data-bulk-all aria-label={`Select all ${cfg.title.toLowerCase()}`} />
                </th>
              )}
              {cfg.columns.map((c) => (
                <th key={c.name} className={c.money ? "num" : ""}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.id)} className="hover:bg-slate-50 has-[:checked]:bg-brand-50">
                {cfg.bulk && (
                  <td>
                    <input type="checkbox" data-bulk-id={String(r.id)} aria-label={`Select ${String(r.name)}`} />
                  </td>
                )}
                {cfg.columns.map((c, i) => (
                  <td key={c.name} className={c.money ? "num" : "max-w-xs truncate"}>
                    {i === 0 ? (
                      <Link className="font-medium text-brand-700 hover:underline" href={`/${entity}/${r.id}`}>
                        {String(r[c.name] ?? "")}
                      </Link>
                    ) : c.money ? (
                      peso(r[c.name] as number)
                    ) : (
                      String(r[c.name] ?? "—")
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <>
      <PageHeader
        title={cfg.title}
        subtitle={`${rows.length} ${rows.length === 1 ? cfg.singular.toLowerCase() : cfg.title.toLowerCase()}${search ? ` matching “${search}”` : ""}`}
        actions={
          <>
            {cfg.csv && (
              <>
                <a href={`/${entity}/export`} className="btn">Export CSV</a>
                <Link href={`/${entity}/import`} className="btn">Import CSV</Link>
              </>
            )}
            <Link href={`/${entity}/new`} className="btn btn-primary">+ New {cfg.singular.toLowerCase()}</Link>
          </>
        }
      />
      {updated && (
        <p className="ok-box mb-4">
          Updated {Number(updated)} {Number(updated) === 1 ? cfg.singular.toLowerCase() : cfg.title.toLowerCase()}.
        </p>
      )}
      <form className="mb-4 flex max-w-md gap-2">
        <input className="input" name="q" defaultValue={search} placeholder={`Search ${cfg.title.toLowerCase()} by name`} />
        <button className="btn">Search</button>
      </form>
      {cfg.bulk && rows.length > 0 ? (
        <BulkSelect
          entity={entity}
          singular={cfg.singular.toLowerCase()}
          plural={cfg.title.toLowerCase()}
          bulkDelete={bulkDeleteMaster.bind(null, entity)}
        >
          {listTable}
        </BulkSelect>
      ) : (
        listTable
      )}
    </>
  );
}

/** Supplier choices, only loaded for lists that have a supplier field. */
async function supplierOptions(entity: MasterKey) {
  if (!MASTERS[entity].fields.some((f) => f.type === "supplier")) return [];
  return query<{ id: number; name: string }>("SELECT id, name FROM suppliers ORDER BY name");
}

export async function MasterNewPage({ entity }: { entity: MasterKey }) {
  await requireUser();
  const cfg = MASTERS[entity];
  const suppliers = await supplierOptions(entity);
  return (
    <>
      <PageHeader title={`New ${cfg.singular.toLowerCase()}`} back={{ href: `/${entity}`, label: cfg.title }} />
      <MasterForm entity={entity} id={null} suppliers={suppliers} />
    </>
  );
}

export async function MasterEditPage({ entity, id, error }: { entity: MasterKey; id: string; error?: string }) {
  await requireUser();
  const cfg = MASTERS[entity];
  const table = TABLES[entity];
  const numId = Number(id);
  if (!Number.isInteger(numId)) notFound();
  const [row, suppliers] = await Promise.all([
    queryOne<Record<string, unknown>>(`SELECT ${cols(table)} FROM ${table} WHERE id = ?`, [numId]),
    supplierOptions(entity),
  ]);
  if (!row) notFound();
  return (
    <>
      <PageHeader
        title={String(row.name)}
        subtitle={`Edit ${cfg.singular.toLowerCase()}`}
        back={{ href: `/${entity}`, label: cfg.title }}
        actions={<ConfirmButton action={deleteMaster.bind(null, entity, numId)} label="Delete" confirmLabel="Yes, delete" />}
      />
      {error === "in-use" && (
        <p className="error-box mb-4 max-w-3xl">
          This {cfg.singular.toLowerCase()} is used on purchase orders, so it can’t be deleted.
        </p>
      )}
      <MasterForm entity={entity} id={numId} initial={row} suppliers={suppliers} />
    </>
  );
}

export async function MasterImportPage({ entity }: { entity: MasterKey }) {
  await requireUser();
  const cfg = MASTERS[entity];
  if (!cfg.csv) notFound();
  const noun = cfg.title.toLowerCase();
  const required = cfg.fields.filter((f) => f.required).map(csvColumn);
  return (
    <>
      <PageHeader title={`Import ${noun}`} subtitle="Add or bulk-edit from a spreadsheet." back={{ href: `/${entity}`, label: cfg.title }} />
      <div className="mb-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="card space-y-2 p-5 text-sm text-slate-700">
          <h2 className="mb-1">How it works</h2>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              <a href={`/${entity}/export`} className="text-brand-600 underline">Export the current list</a> (or the{" "}
              <a href={`/${entity}/export?template=1`} className="text-brand-600 underline">blank template</a>) and open it in Excel or Google Sheets.
            </li>
            <li>Edit cells, or add new rows with the <code>id</code> left blank. Save as CSV.</li>
            <li>Upload it here. <b>Check file</b> shows what will change; <b>Import</b> saves it.</li>
          </ol>
          <ul className="list-disc space-y-1 pl-5 text-slate-600">
            <li>Rows with an <code>id</code> update that {cfg.singular.toLowerCase()}; rows without one are added as new.</li>
            <li>You can leave out columns you don’t want to change — e.g. just <code>id</code> and <code>default_cost</code> to update prices.</li>
            {cfg.fields.some((f) => f.type === "supplier") && (
              <li><code>default_supplier</code> is the supplier’s name, exactly as it appears under Suppliers. Leave blank for none.</li>
            )}
            <li>Rows missing from the file are left alone — importing never deletes anything.</li>
            <li>If any row has a problem, nothing is saved, and each problem is listed by row number.</li>
          </ul>
        </section>
        <section className="card p-5 text-sm">
          <h2 className="mb-2">Columns</h2>
          <ul className="space-y-0.5">
            <li><code>id</code> <span className="text-slate-500">— blank for new</span></li>
            {cfg.fields.map((f) => (
              <li key={f.name}>
                <code>{csvColumn(f)}</code> <span className="text-slate-500">— {f.label}{required.includes(csvColumn(f)) ? " (required)" : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <ImportForm action={importMasterCsv.bind(null, entity)} listHref={`/${entity}`} noun={noun} />
    </>
  );
}

export async function MasterBulkEditPage({ entity, ids }: { entity: MasterKey; ids?: string }) {
  await requireUser();
  const cfg = MASTERS[entity];
  if (!cfg.bulk) notFound();
  const idList = [...new Set((ids ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 1000);
  const [rows, suppliers] = await Promise.all([
    idList.length
      ? query<{ id: number; name: string }>(`SELECT id, name FROM ${TABLES[entity]} WHERE id IN (?) ORDER BY name`, [idList])
      : Promise.resolve([]),
    supplierOptions(entity),
  ]);
  const found = rows.map((r) => r.id);
  return (
    <>
      <PageHeader
        title={`Edit ${found.length} ${found.length === 1 ? cfg.singular.toLowerCase() : cfg.title.toLowerCase()}`}
        subtitle={rows.length ? rows.slice(0, 8).map((r) => r.name).join(", ") + (rows.length > 8 ? `, and ${rows.length - 8} more` : "") : undefined}
        back={{ href: `/${entity}`, label: cfg.title }}
      />
      {found.length === 0 ? (
        <Empty>
          Nothing selected. <Link className="text-brand-600 underline" href={`/${entity}`}>Go back and tick some rows</Link>.
        </Empty>
      ) : (
        <BulkEditForm entity={entity} count={found.length} action={bulkUpdateMaster.bind(null, entity, found)} suppliers={suppliers} />
      )}
    </>
  );
}

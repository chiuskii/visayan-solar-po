import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteMaster } from "@/app/actions/masters";
import { query, queryOne } from "@/db";
import { cols } from "@/db/types";
import { requireUser } from "@/lib/auth";
import { peso } from "@/lib/format";
import { MASTERS, type MasterKey } from "@/lib/masters";
import { ConfirmButton } from "./client-ui";
import { MasterForm } from "./master-form";
import { Empty, PageHeader } from "./ui";

const TABLES = { clients: "clients", suppliers: "suppliers", materials: "materials" } as const;

export async function MasterListPage({ entity, q }: { entity: MasterKey; q?: string }) {
  await requireUser();
  const cfg = MASTERS[entity];
  const table = TABLES[entity];
  const search = (q ?? "").trim();
  const rows = await query<Record<string, unknown>>(
    `SELECT ${cols(table)} FROM ${table} ${search ? "WHERE name LIKE ?" : ""} ORDER BY name LIMIT 500`,
    search ? [`%${search}%`] : [],
  );

  return (
    <>
      <PageHeader
        title={cfg.title}
        subtitle={`${rows.length} ${rows.length === 1 ? cfg.singular.toLowerCase() : cfg.title.toLowerCase()}${search ? ` matching “${search}”` : ""}`}
        actions={<Link href={`/${entity}/new`} className="btn btn-primary">+ New {cfg.singular.toLowerCase()}</Link>}
      />
      <form className="mb-4 flex max-w-md gap-2">
        <input className="input" name="q" defaultValue={search} placeholder={`Search ${cfg.title.toLowerCase()} by name`} />
        <button className="btn">Search</button>
      </form>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty>
            No {cfg.title.toLowerCase()} yet. <Link className="text-brand-600 underline" href={`/${entity}/new`}>Add the first one</Link>.
          </Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                {cfg.columns.map((c) => (
                  <th key={c.name} className={c.money ? "num" : ""}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.id)} className="hover:bg-slate-50">
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
    </>
  );
}

export async function MasterNewPage({ entity }: { entity: MasterKey }) {
  await requireUser();
  const cfg = MASTERS[entity];
  return (
    <>
      <PageHeader title={`New ${cfg.singular.toLowerCase()}`} back={{ href: `/${entity}`, label: cfg.title }} />
      <MasterForm entity={entity} id={null} />
    </>
  );
}

export async function MasterEditPage({ entity, id, error }: { entity: MasterKey; id: string; error?: string }) {
  await requireUser();
  const cfg = MASTERS[entity];
  const table = TABLES[entity];
  const numId = Number(id);
  if (!Number.isInteger(numId)) notFound();
  const row = await queryOne<Record<string, unknown>>(`SELECT ${cols(table)} FROM ${table} WHERE id = ?`, [numId]);
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
      <MasterForm entity={entity} id={numId} initial={row} />
    </>
  );
}

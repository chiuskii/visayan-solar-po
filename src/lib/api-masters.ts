import "server-only";
import { execute, query, queryOne } from "@/db";
import { cols, toRow } from "@/db/types";
import { ApiError, apiRoute, idParam, jsonBody, paging } from "./api-keys";
import { readFields } from "./master-fields";
import { MASTERS, type MasterKey } from "./masters";

type IdCtx = { params: Promise<{ id: string }> };

async function getRecord(entity: MasterKey, id: number) {
  const row = await queryOne(`SELECT ${cols(entity)} FROM ${entity} WHERE id = ?`, [id]);
  if (!row) throw new ApiError(404, `${MASTERS[entity].singular} not found.`);
  return row;
}

/** Validates a JSON body with the same rules as the app's forms. `partial` leaves out fields the body doesn't have. */
async function readBody(entity: MasterKey, body: Record<string, unknown>, partial: boolean) {
  let values;
  try {
    values = readFields(entity, (name) => {
      const v = body[name];
      if (v === undefined) return partial ? undefined : "";
      return v === null ? "" : String(v);
    });
  } catch (e) {
    throw new ApiError(400, (e as Error).message);
  }
  if (Object.keys(values).length === 0) throw new ApiError(400, `No fields to change. Fields: ${MASTERS[entity].fields.map((f) => f.name).join(", ")}.`);
  for (const f of MASTERS[entity].fields) {
    const sid = values[f.name];
    if (f.type === "supplier" && sid != null && !(await queryOne("SELECT id FROM suppliers WHERE id = ?", [sid]))) {
      throw new ApiError(400, `${f.label}: supplier ${sid} doesn’t exist.`);
    }
  }
  return values;
}

/** GET (list, `?search=`) and POST (create) for /api/v1/<entity>. */
export function masterListRoutes(entity: MasterKey) {
  return {
    GET: apiRoute(entity, "READ", async (req) => {
      const url = new URL(req.url);
      const { limit, offset } = paging(url);
      const search = url.searchParams.get("search")?.trim();
      const where = search ? "WHERE name LIKE ?" : "";
      const params = search ? [`%${search}%`] : [];
      const [data, count] = await Promise.all([
        query(`SELECT ${cols(entity)} FROM ${entity} ${where} ORDER BY name, id LIMIT ? OFFSET ?`, [...params, limit, offset]),
        queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM ${entity} ${where}`, params),
      ]);
      return { data, total: Number(count?.n ?? 0), limit, offset };
    }),
    POST: apiRoute(entity, "WRITE", async (req) => {
      const values = await readBody(entity, await jsonBody(req), false);
      const res = await execute(`INSERT INTO ${entity} SET ?`, [toRow(entity, values)]);
      return Response.json({ data: await getRecord(entity, res.insertId) }, { status: 201 });
    }),
  };
}

/** GET (one) and PATCH (update the fields sent) for /api/v1/<entity>/<id>. */
export function masterItemRoutes(entity: MasterKey) {
  return {
    GET: apiRoute<IdCtx>(entity, "READ", async (_req, _c, ctx) => ({ data: await getRecord(entity, idParam((await ctx.params).id)) })),
    PATCH: apiRoute<IdCtx>(entity, "WRITE", async (req, _c, ctx) => {
      const id = idParam((await ctx.params).id);
      await getRecord(entity, id);
      const values = await readBody(entity, await jsonBody(req), true);
      await execute(`UPDATE ${entity} SET ? WHERE id = ?`, [toRow(entity, values), id]);
      return { data: await getRecord(entity, id) };
    }),
  };
}

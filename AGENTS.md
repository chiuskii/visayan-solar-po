<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project notes — Visayan Solar PO System

- Stack: Next.js 16 (App Router, TypeScript), plain SQL with mysql2 (no ORM), MySQL 8, Tailwind CSS 4, zod.
- Route guard lives in `src/proxy.ts` (Next 16 renamed middleware → proxy). Server actions re-check auth with `requireUser()` / `requireAdmin()` from `src/lib/auth.ts`.
- Database access: `query` / `queryOne` / `execute` / `transaction` from `src/db/index.ts`. Always pass values as `?` params, never interpolate them. Row types and the camelCase→column map live in `src/db/types.ts`; use `cols(table, alias)` for SELECT lists and `toRow(table, values)` with `INSERT ... SET ?` / `UPDATE ... SET ?`.
- Schema changes: add a new numbered SQL file in `migrations/` (never edit an applied one), update `src/db/types.ts`, then `npm run db:migrate`.
- Server actions live in `src/app/actions/`. Client forms use `useFormAction` from `src/components/client-ui.tsx` so fields are kept when validation fails.
- PO status is derived from deliveries by `refreshDeliveryStatus()` in `src/lib/po.ts` — call it after anything that changes items or deliveries.
- Money and quantities are DECIMAL columns read as numbers (pool option `decimalNumbers`); booleans come back as true/false. Round with `round2()`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project notes — Visayan Solar PO System

- Stack: Next.js 16 (App Router, TypeScript), Drizzle ORM + mysql2, MySQL 8, Tailwind CSS 4, zod.
- Route guard lives in `src/proxy.ts` (Next 16 renamed middleware → proxy). Server actions re-check auth with `requireUser()` / `requireAdmin()` from `src/lib/auth.ts`.
- Database schema: `src/db/schema.ts`. After changing it run `npm run db:generate` to create a SQL migration in `drizzle/`, then `npm run db:migrate`.
- Server actions live in `src/app/actions/`. Client forms use `useFormAction` from `src/components/client-ui.tsx` so fields are kept when validation fails.
- PO status is derived from deliveries by `refreshDeliveryStatus()` in `src/lib/po.ts` — call it after anything that changes items or deliveries.
- Money and quantities are DECIMAL columns read as numbers (`mode: "number"`); round with `round2()`.

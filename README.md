# Visayan Solar — PO System

Purchase orders for Visayan Solar: clients, suppliers, materials, POs with line items, delivery tracking, and a printable PO.

**Stack:** Next.js 16 (TypeScript) · MySQL 8 (plain SQL via mysql2) · Tailwind CSS · Docker (dev + prod)

---

## 1. What you need

- [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/) — open it once so it's running
- [VS Code](https://code.visualstudio.com/)
- Node.js 22 (only if you want to run without Docker)

## 2. Run it in development (hot reload)

Open this folder in VS Code, then open the terminal (**Terminal → New Terminal**) and run:

```bash
docker compose -f docker-compose.dev.yml up --build
```

The first run takes a few minutes. When you see `Ready`, open **http://localhost:3000**.

Sign in with the starter admin account:

| Email | Password |
|---|---|
| `admin@visayansolar.local` | `ChangeMe123!` |

Change this password right away under **My account**.

Code changes in `src/` reload the browser automatically. Stop with `Ctrl + C`.

Useful commands:

```bash
docker compose -f docker-compose.dev.yml up -d          # run in the background
docker compose -f docker-compose.dev.yml logs -f app    # watch app logs
docker compose -f docker-compose.dev.yml down           # stop (data is kept)
docker compose -f docker-compose.dev.yml down -v        # stop AND wipe the dev database
```

**Connect to the dev database** (e.g. with the MySQL extension in VS Code):
host `localhost`, port `3307`, user `po_user`, password `po_password`, database `visayan_po`.

## 3. Run it in production

1. Copy the settings file and fill in real values:
   ```bash
   cp .env.example .env
   openssl rand -base64 32   # paste the result as AUTH_SECRET
   ```
   Set strong `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`, and `ADMIN_PASSWORD`.
2. Start it:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env up -d --build
   ```
3. Open `http://<server-ip>:3000`. Other computers on the same network can use that address.

On every start the app waits for MySQL, applies any new database migrations, and makes sure the admin account exists.

If you put the app behind HTTPS (e.g. a reverse proxy or Cloudflare Tunnel), set `COOKIE_SECURE=true` in `.env`.

**Back up the database:**
```bash
docker compose -f docker-compose.prod.yml exec db sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" visayan_po' > backup-$(date +%F).sql
```

**Update after code changes:** run the same `up -d --build` command again.

## 4. How it works

| Area | What you can do |
|---|---|
| **Dashboard** | Counts by status, open PO value, open POs sorted by expected delivery (overdue in red) |
| **Purchase Orders** | Create a PO for a client from a supplier, pick materials from the list or type custom items, 12% VAT option, discount. Filter by client/status. |
| **Deliveries** | On a PO, record what arrived (partial or full) with DR number. Status updates itself: Ordered → Partially delivered → Delivered. |
| **Print / PDF** | Clean A4 PO layout with company details, totals, and signature lines. Use the browser's *Save as PDF*. |
| **Clients / Suppliers / Materials** | Master lists. Materials come pre-loaded with common solar items and default costs. |
| **Users** *(admin)* | Add staff, set Admin/Staff role, disable accounts, reset passwords. |
| **Settings** *(admin)* | Company name, address, TIN, PO number prefix, default terms, approver name printed on POs. |

PO numbers are automatic: `VS-PO-2026-0001`, `VS-PO-2026-0002`, … restarting each year (prefix editable in Settings).

**Roles:** Staff can do everything with POs and lists. Admins can also manage users and settings, delete POs that have no deliveries, and remove deliveries entered by mistake.

## 5. Project layout

```
src/
  app/
    (app)/          pages behind login (dashboard, pos, clients, …)
    (print)/        printable PO page
    login/          sign-in page
    actions/        server actions (save PO, record delivery, users, settings)
    api/health/     health check → {"ok": true}
  components/       UI pieces (PO form, delivery form, lists)
  db/              MySQL pool + query helpers (index.ts), row types (types.ts)
  lib/              auth, PO helpers, formatting
  proxy.ts          sends signed-out visitors to /login
migrations/         SQL migrations (applied automatically)
scripts/            migrate, seed, wait-for-db (used by Docker)
Dockerfile          dev + prod targets
docker-compose.dev.yml / docker-compose.prod.yml
```

## 6. Changing the database

1. Add a new file in `migrations/` with the next number, e.g. `0001_add_po_remarks.sql`, containing the plain SQL (`ALTER TABLE ...`). Never edit a file that has already been applied.
2. Update the matching type and column list in `src/db/types.ts`.
3. Restart the app container — the migration is applied on start (or run `npm run db:migrate`).

## 7. Running without Docker (optional)

```bash
docker compose -f docker-compose.dev.yml up -d db   # just MySQL
cp .env.example .env                                # DATABASE_URL already points at it
npm install
export $(grep -v '^#' .env | xargs)
npm run db:migrate && npm run db:seed
npm run dev
```

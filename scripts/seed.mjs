// Creates the first admin account and a starter list of solar materials.
// Safe to run more than once: it skips anything that already exists.
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const email = (process.env.ADMIN_EMAIL || "admin@visayansolar.local").toLowerCase();
const password = process.env.ADMIN_PASSWORD || "ChangeMe123!";
const name = process.env.ADMIN_NAME || "Administrator";

const conn = await mysql.createConnection(url);

const [admins] = await conn.query("SELECT id FROM users WHERE email = ?", [email]);
if (admins.length === 0) {
  const hash = await bcrypt.hash(password, 10);
  await conn.query("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'ADMIN')", [name, email, hash]);
  console.log(`Admin created: ${email}`);
} else {
  console.log(`Admin already exists: ${email}`);
}

const [[{ n }]] = await conn.query("SELECT COUNT(*) AS n FROM materials");
if (Number(n) === 0) {
  const starter = [
    ["Solar panel, mono PERC", "550W", "Panels", "pcs", 6500],
    ["Solar panel, mono bifacial", "620W", "Panels", "pcs", 7800],
    ["Hybrid inverter", "6kW", "Inverters", "pcs", 58000],
    ["Hybrid inverter", "10kW", "Inverters", "pcs", 95000],
    ["Grid-tie inverter", "5kW", "Inverters", "pcs", 42000],
    ["LiFePO4 battery", "5kWh 51.2V", "Batteries", "pcs", 72000],
    ["Mounting rail, aluminum", "4.2m", "Mounting", "pcs", 1450],
    ["Mid clamp", "30-35mm", "Mounting", "pcs", 45],
    ["End clamp", "30-35mm", "Mounting", "pcs", 45],
    ["L-foot / roof hook", "Metal roof", "Mounting", "pcs", 120],
    ["PV cable", "4mm², red", "Cables", "m", 65],
    ["PV cable", "4mm², black", "Cables", "m", 65],
    ["MC4 connector", "Pair", "Connectors", "set", 120],
    ["DC breaker", "2P 32A 1000VDC", "Protection", "pcs", 950],
    ["AC breaker", "2P 40A", "Protection", "pcs", 650],
    ["Surge protection device", "DC 1000V", "Protection", "pcs", 1800],
    ["Combiner box", "2-in 1-out", "Protection", "pcs", 4500],
    ["Grounding rod", "5/8\" x 8ft", "Grounding", "pcs", 850],
    ["PVC conduit", "3/4\"", "Conduit", "pcs", 180],
  ];
  await conn.query("INSERT INTO materials (name, spec, category, unit, default_cost) VALUES ?", [starter]);
  console.log(`Added ${starter.length} starter materials.`);
}

await conn.query(
  `INSERT IGNORE INTO company_settings (id, company_name, po_prefix, default_terms, po_footer)
   VALUES (1, 'Visayan Solar', 'VS-PO', '30 days', 'Please indicate the PO number on your delivery receipt and invoice.')`,
);

await conn.end();
console.log("Seed complete.");

/**
 * Add Vercel A records for food-order-app subdomains on nexaipla.com (Cloudflare DNS).
 * Requires CLOUDFLARE_API_TOKEN in .env (Zone DNS Write for nexaipla.com).
 *
 * Usage: node scripts/setup-nexaipla-dns.mjs
 */
import fs from "node:fs";
import path from "node:path";

const VERCEL_A = "76.76.21.21";
const ZONE = "nexaipla.com";
const SUBDOMAINS = ["foodorder", "orders"];

function loadEnvFile(filename) {
  const fullPath = path.join(process.cwd(), filename);
  if (!fs.existsSync(fullPath)) return;
  for (const line of fs.readFileSync(fullPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
if (!token) {
  console.error("Set CLOUDFLARE_API_TOKEN in .env (Zone DNS Write for nexaipla.com).");
  console.error("Manual DNS (Cloudflare dashboard):");
  for (const sub of SUBDOMAINS) {
    console.error(`  A  ${sub}.${ZONE}  ->  ${VERCEL_A}  (Proxy: DNS only / grey cloud)`);
  }
  process.exitCode = 1;
  process.exit();
}

async function cf(pathname, init = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json();
  if (!body.success) {
    throw new Error(body.errors?.map((e) => e.message).join("; ") || res.statusText);
  }
  return body.result;
}

async function ensureARecord(zoneId, name) {
  const existing = await cf(
    `/zones/${zoneId}/dns_records?type=A&name=${encodeURIComponent(name)}`,
  );
  const match = existing.find((r) => r.content === VERCEL_A);
  if (match) {
    console.log(`OK  ${name} -> ${VERCEL_A} (exists)`);
    return;
  }
  if (existing.length > 0) {
    await cf(`/zones/${zoneId}/dns_records/${existing[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({ type: "A", name, content: VERCEL_A, proxied: false, ttl: 1 }),
    });
    console.log(`UPD ${name} -> ${VERCEL_A}`);
    return;
  }
  await cf(`/zones/${zoneId}/dns_records`, {
    method: "POST",
    body: JSON.stringify({ type: "A", name, content: VERCEL_A, proxied: false, ttl: 1 }),
  });
  console.log(`ADD ${name} -> ${VERCEL_A}`);
}

const zones = await cf(`/zones?name=${encodeURIComponent(ZONE)}`);
const zone = zones[0];
if (!zone) {
  console.error(`Zone not found: ${ZONE}`);
  process.exit(1);
}

for (const sub of SUBDOMAINS) {
  await ensureARecord(zone.id, `${sub}.${ZONE}`);
}

console.log("Done. Vercel will verify domains within a few minutes.");

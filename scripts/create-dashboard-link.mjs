import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_TTL_SECONDS = 90 * 24 * 60 * 60;
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = DEFAULT_TTL_SECONDS;

function loadEnvFile(filename) {
  const fullPath = path.join(process.cwd(), filename);
  if (!fs.existsSync(fullPath)) {
    return;
  }

  const lines = fs.readFileSync(fullPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }

    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

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

function ttlFromArgs(args) {
  const daysIndex = args.indexOf("--days");
  const days = daysIndex === -1 ? undefined : Number.parseInt(args[daysIndex + 1] ?? "", 10);
  if (Number.isFinite(days) && days > 0) {
    return days * 24 * 60 * 60;
  }

  const raw = process.env.DASHBOARD_LINK_TTL_SECONDS?.trim();
  const envTtl = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(envTtl) ? envTtl : undefined;
}

function normalizeTtlSeconds(requested) {
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, requested));
}

function createCode(secret, ttlSeconds) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const permanent = ttlSeconds === undefined;
  const payload = {
    purpose: "dashboard",
    iat: nowSeconds,
    nonce: crypto.randomUUID(),
    ...(permanent ? {} : { exp: nowSeconds + ttlSeconds }),
  };
  const payloadPart = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payloadPart).digest("base64url");
  return {
    code: `${payloadPart}.${signature}`,
    expiresAt: permanent ? null : new Date(payload.exp * 1000),
    permanent,
    ttlSeconds,
  };
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const secret =
  process.env.DASHBOARD_LINK_SECRET?.trim() ||
  (process.env.NODE_ENV === "production" ? "" : "dev-dashboard-link-secret");

if (!secret) {
  console.error("Set DASHBOARD_LINK_SECRET before creating a production dashboard link.");
  process.exitCode = 1;
} else {
  const requestedTtl = ttlFromArgs(process.argv.slice(2));
  const ttlSeconds = requestedTtl === undefined ? undefined : normalizeTtlSeconds(requestedTtl);
  const { code, expiresAt, permanent } = createCode(secret, ttlSeconds);
  const baseUrl = (process.env.APP_BASE_URL?.trim() || "http://localhost:3002").replace(/\/+$/, "");
  const link = `${baseUrl}/dashboard?code=${encodeURIComponent(code)}`;

  if (permanent) {
    console.log("Dashboard link (no expiry):");
  } else {
    console.log(`Dashboard link (${Math.round(ttlSeconds / 86400)} days):`);
  }
  console.log(link);
  if (expiresAt) {
    console.log(`Expires: ${expiresAt.toISOString()}`);
  }
}

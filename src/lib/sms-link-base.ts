const DEFAULT_DEV_APP_BASE_URL = "http://localhost:3002";
const PLACEHOLDER_HOSTS = new Set(["your-vercel-app.vercel.app"]);

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function withHttpsIfMissing(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function isKnownPlaceholder(value: string): boolean {
  try {
    return PLACEHOLDER_HOSTS.has(new URL(withHttpsIfMissing(value)).hostname.toLowerCase());
  } catch {
    return value.toLowerCase().includes("your-vercel-app");
  }
}

function getConfiguredBaseUrl(envName: string): string | undefined {
  const raw = process.env[envName]?.trim();
  if (!raw || isKnownPlaceholder(raw)) {
    return undefined;
  }

  const normalized = normalizeBaseUrl(withHttpsIfMissing(raw));
  try {
    new URL(normalized);
  } catch {
    throw new Error(`${envName} must be an absolute URL`);
  }

  return normalized;
}

function getVercelBaseUrl(): string | undefined {
  const raw =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    process.env.VERCEL_BRANCH_URL?.trim() ||
    process.env.VERCEL_URL?.trim();

  if (!raw || isKnownPlaceholder(raw)) {
    return undefined;
  }

  return normalizeBaseUrl(withHttpsIfMissing(raw));
}

export function getAppBaseUrl(request?: Request): string {
  const configured = getConfiguredBaseUrl("APP_BASE_URL") ?? getVercelBaseUrl();
  if (configured) {
    return configured;
  }

  if (request) {
    return normalizeBaseUrl(new URL(request.url).origin);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_BASE_URL or SMS_LINK_BASE_URL must be set to a real public URL");
  }

  return DEFAULT_DEV_APP_BASE_URL;
}

export function getSmsLinkBaseUrl(request?: Request): string {
  return getConfiguredBaseUrl("SMS_LINK_BASE_URL") ?? getAppBaseUrl(request);
}

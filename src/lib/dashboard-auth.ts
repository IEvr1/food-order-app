import type { NextRequest } from "next/server";

export const DASHBOARD_ACCESS_COOKIE = "dashboard_access";

const DASHBOARD_LINK_PURPOSE = "dashboard";
const DEFAULT_DASHBOARD_LINK_TTL_SECONDS = 90 * 24 * 60 * 60;
const MIN_DASHBOARD_LINK_TTL_SECONDS = 60;
const MAX_DASHBOARD_LINK_TTL_SECONDS = DEFAULT_DASHBOARD_LINK_TTL_SECONDS;
/** Browser-safe cookie lifetime; refreshed on each dashboard visit. */
export const DASHBOARD_ACCESS_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

type DashboardAccessPayload = {
  purpose: typeof DASHBOARD_LINK_PURPOSE;
  iat: number;
  nonce: string;
  exp?: number;
};

export type VerifiedDashboardAccess = {
  permanent: boolean;
  expiresAt: Date | null;
  cookieMaxAgeSeconds: number;
};

function dashboardLinkSecret(): string | null {
  const secret = process.env.DASHBOARD_LINK_SECRET?.trim();
  if (secret) {
    return secret;
  }
  return process.env.NODE_ENV === "production" ? null : "dev-dashboard-link-secret";
}

export function isDashboardLinkAuthAvailable(): boolean {
  return Boolean(dashboardLinkSecret());
}

function normalizeDashboardTtlSeconds(requested?: number): number {
  const base = requested ?? DEFAULT_DASHBOARD_LINK_TTL_SECONDS;
  return Math.min(MAX_DASHBOARD_LINK_TTL_SECONDS, Math.max(MIN_DASHBOARD_LINK_TTL_SECONDS, base));
}

function base64UrlEncode(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlDecodeToString(input: string): string {
  return new TextDecoder().decode(base64UrlDecodeToBytes(input));
}

async function signDashboardTokenPayload(payloadPart: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadPart));
  return base64UrlEncode(new Uint8Array(signature));
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  const length = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

export async function createDashboardAccessCode(options?: {
  ttlSeconds?: number;
}): Promise<{ code: string; expiresAt: Date | null; permanent: boolean }> {
  const secret = dashboardLinkSecret();
  if (!secret) {
    throw new Error("DASHBOARD_LINK_SECRET must be set in production");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const ttlSeconds =
    options?.ttlSeconds === undefined ? undefined : normalizeDashboardTtlSeconds(options.ttlSeconds);
  const permanent = ttlSeconds === undefined;
  const payload: DashboardAccessPayload = {
    purpose: DASHBOARD_LINK_PURPOSE,
    iat: nowSeconds,
    nonce: crypto.randomUUID(),
    ...(permanent ? {} : { exp: nowSeconds + ttlSeconds }),
  };
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const signature = await signDashboardTokenPayload(payloadPart, secret);
  return {
    code: `${payloadPart}.${signature}`,
    expiresAt: permanent ? null : new Date(payload.exp! * 1000),
    permanent,
  };
}

export async function verifyDashboardAccessCode(code: string | undefined | null): Promise<VerifiedDashboardAccess | null> {
  const secret = dashboardLinkSecret();
  const trimmed = code?.trim();
  if (!secret || !trimmed) {
    return null;
  }

  const [payloadPart, signature, extra] = trimmed.split(".");
  if (!payloadPart || !signature || extra !== undefined) {
    return null;
  }

  const expected = await signDashboardTokenPayload(payloadPart, secret);
  if (!timingSafeEqual(signature, expected)) {
    return null;
  }

  let payload: DashboardAccessPayload;
  try {
    payload = JSON.parse(base64UrlDecodeToString(payloadPart)) as DashboardAccessPayload;
  } catch {
    return null;
  }

  if (payload.purpose !== DASHBOARD_LINK_PURPOSE) {
    return null;
  }

  if (payload.exp === undefined) {
    return {
      permanent: true,
      expiresAt: null,
      cookieMaxAgeSeconds: DASHBOARD_ACCESS_COOKIE_MAX_AGE_SECONDS,
    };
  }

  if (!Number.isFinite(payload.exp)) {
    return null;
  }

  const remainingSeconds = Math.floor(payload.exp - Date.now() / 1000);
  if (remainingSeconds <= 0) {
    return null;
  }

  return {
    permanent: false,
    expiresAt: new Date(payload.exp * 1000),
    cookieMaxAgeSeconds: Math.min(remainingSeconds, DASHBOARD_ACCESS_COOKIE_MAX_AGE_SECONDS),
  };
}

export function dashboardAccessCookieOptions(verified: VerifiedDashboardAccess) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: verified.cookieMaxAgeSeconds,
  };
}

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  const prefix = `${name}=`;
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : null;
}

export async function isDashboardMutationAuthorized(headers: Headers): Promise<boolean> {
  const code = readCookie(headers.get("cookie"), DASHBOARD_ACCESS_COOKIE);
  return Boolean(await verifyDashboardAccessCode(code));
}

export async function isDashboardPageAuthorized(request: NextRequest): Promise<boolean> {
  const code = request.cookies.get(DASHBOARD_ACCESS_COOKIE)?.value;
  return Boolean(await verifyDashboardAccessCode(code));
}

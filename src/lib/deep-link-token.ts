import crypto from "crypto";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ManageSessionPayload } from "@/lib/manage-session";

const DEFAULT_TOKEN_TTL_SECONDS = 60 * 30;
const MAX_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const MIN_TOKEN_TTL_SECONDS = 60;

function normalizeTtlSeconds(requested?: number): number {
  const base = requested ?? DEFAULT_TOKEN_TTL_SECONDS;
  return Math.min(MAX_TOKEN_TTL_SECONDS, Math.max(MIN_TOKEN_TTL_SECONDS, base));
}

type TokenPayload = {
  shopId: string;
  phoneE164: string;
  orderId?: string;
  jti: string;
};

const SHORT_CODE_LENGTH = 8;

function randomShortCode(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.randomBytes(SHORT_CODE_LENGTH);
  let out = "";
  for (let i = 0; i < SHORT_CODE_LENGTH; i += 1) {
    out += alphabet[bytes[i]! % alphabet.length]!;
  }
  return out;
}

export function smsLinkSigningSecret() {
  const secret = process.env.SMS_LINK_SECRET;
  if (process.env.NODE_ENV === "production") {
    if (!secret) {
      throw new Error("SMS_LINK_SECRET must be set in production");
    }
    return secret;
  }
  return secret ?? "dev-secret-change-me";
}

export async function createDeepLinkToken(
  payload: Omit<TokenPayload, "jti">,
  options?: { ttlSeconds?: number },
): Promise<{ token: string; shortCode: string; expiresAt: Date; ttlSeconds: number }> {
  const ttlSeconds = normalizeTtlSeconds(options?.ttlSeconds);
  const now = Date.now();
  const reusable = await prisma.smsLinkToken.findFirst({
    where: {
      shopId: payload.shopId,
      phoneE164: payload.phoneE164,
      orderId: payload.orderId ?? null,
      shortCode: { not: null },
      expiresAt: { gt: new Date(now) },
    },
    orderBy: { expiresAt: "desc" },
  });

  if (reusable?.shortCode) {
    const remainingSec = Math.max(1, Math.floor((reusable.expiresAt.getTime() - now) / 1000));
    const jti = crypto.randomUUID();
    const signed = jwt.sign({ ...payload, jti }, smsLinkSigningSecret(), {
      expiresIn: remainingSec,
    });
    const tokenHash = crypto.createHash("sha256").update(signed).digest("hex");
    await prisma.smsLinkToken.update({
      where: { id: reusable.id },
      data: { tokenHash },
    });
    return {
      token: signed,
      shortCode: reusable.shortCode,
      expiresAt: reusable.expiresAt,
      ttlSeconds: remainingSec,
    };
  }

  const jti = crypto.randomUUID();
  const signed = jwt.sign({ ...payload, jti }, smsLinkSigningSecret(), {
    expiresIn: ttlSeconds,
  });
  const tokenHash = crypto.createHash("sha256").update(signed).digest("hex");
  const expiresAt = new Date(now + ttlSeconds * 1000);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const shortCode = randomShortCode();
    try {
      await prisma.smsLinkToken.create({
        data: {
          shopId: payload.shopId,
          orderId: payload.orderId,
          phoneE164: payload.phoneE164,
          tokenHash,
          shortCode,
          expiresAt,
        },
      });
      return { token: signed, shortCode, expiresAt, ttlSeconds };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Could not allocate short link code");
}

export async function verifyDeepLinkToken(token: string) {
  const decoded = jwt.verify(token, smsLinkSigningSecret()) as TokenPayload;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const record = await prisma.smsLinkToken.findFirst({
    where: { tokenHash, expiresAt: { gt: new Date() } },
  });

  if (!record) {
    throw new Error("Token invalid or expired");
  }

  return decoded;
}

export async function resolveManagePayloadByShortCode(
  shortCode: string,
): Promise<ManageSessionPayload & { linkExpiresAt: Date }> {
  const record = await prisma.smsLinkToken.findFirst({
    where: { shortCode, expiresAt: { gt: new Date() } },
  });

  if (!record) {
    throw new Error("Link invalid or expired");
  }

  return {
    shopId: record.shopId,
    phoneE164: record.phoneE164,
    orderId: record.orderId ?? undefined,
    linkExpiresAt: record.expiresAt,
  };
}

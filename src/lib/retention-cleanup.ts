import { subDays } from "date-fns";
import { prisma } from "@/lib/prisma";

const DEFAULT_RETENTION_DAYS = 365;
const CUSTOMER_DELETE_BATCH_SIZE = 200;

export type RetentionCleanupResult = {
  retentionDays: number;
  cutoff: string;
  expiredSmsTokens: number;
  expiredSessions: number;
  customersDeleted: number;
  customersEligible: number;
  customersRemaining: number;
};

export function retentionDaysFromEnv(): number {
  const raw = process.env.DATA_RETENTION_DAYS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed >= 30 && parsed <= 3650) {
    return parsed;
  }
  return DEFAULT_RETENTION_DAYS;
}

export async function runRetentionCleanup(): Promise<RetentionCleanupResult> {
  const now = new Date();
  const retentionDays = retentionDaysFromEnv();
  const cutoff = subDays(now, retentionDays);

  const [expiredSms, expiredSessions] = await prisma.$transaction([
    prisma.smsLinkToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.conversationSession.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);

  const activeOrders = await prisma.order.findMany({
    where: {
      status: { in: ["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"] },
    },
    select: { customerId: true },
    distinct: ["customerId"],
  });
  const protectedCustomerIds = new Set(activeOrders.map((o) => o.customerId));

  const lastOrderByCustomer = await prisma.order.groupBy({
    by: ["customerId"],
    _max: { createdAt: true },
  });
  const lastOrderMap = new Map(
    lastOrderByCustomer.map((row) => [row.customerId, row._max.createdAt as Date]),
  );

  const allCustomers = await prisma.customer.findMany({
    select: { id: true, createdAt: true },
  });

  const eligibleIds: string[] = [];
  for (const customer of allCustomers) {
    if (protectedCustomerIds.has(customer.id)) continue;
    const lastAt = lastOrderMap.get(customer.id);
    if (lastAt) {
      if (lastAt >= cutoff) continue;
    } else if (customer.createdAt >= cutoff) {
      continue;
    }
    eligibleIds.push(customer.id);
  }

  const batchIds = eligibleIds.slice(0, CUSTOMER_DELETE_BATCH_SIZE);
  let customersDeleted = 0;

  for (const customerId of batchIds) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, shopId: true, phoneE164: true },
    });
    if (!customer || protectedCustomerIds.has(customer.id)) continue;

    await prisma.$transaction([
      prisma.conversationSession.deleteMany({ where: { customerId: customer.id } }),
      prisma.smsLinkToken.deleteMany({
        where: { shopId: customer.shopId, phoneE164: customer.phoneE164 },
      }),
      prisma.customer.delete({ where: { id: customer.id } }),
    ]);
    customersDeleted += 1;
  }

  return {
    retentionDays,
    cutoff: cutoff.toISOString(),
    expiredSmsTokens: expiredSms.count,
    expiredSessions: expiredSessions.count,
    customersDeleted,
    customersEligible: eligibleIds.length,
    customersRemaining: Math.max(0, eligibleIds.length - batchIds.length),
  };
}

const DEFAULT_MAX_BATCHES = 50;

/** Run retention cleanup until no eligible customers remain or batch cap is hit. */
export async function runRetentionCleanupFully(options?: {
  maxBatches?: number;
}): Promise<RetentionCleanupResult & { batches: number }> {
  const maxBatches = options?.maxBatches ?? DEFAULT_MAX_BATCHES;
  let batches = 0;
  let expiredSmsTokens = 0;
  let expiredSessions = 0;
  let customersDeleted = 0;
  let lastResult: RetentionCleanupResult | null = null;

  while (batches < maxBatches) {
    const result = await runRetentionCleanup();
    batches += 1;
    lastResult = result;
    expiredSmsTokens += result.expiredSmsTokens;
    expiredSessions += result.expiredSessions;
    customersDeleted += result.customersDeleted;
    if (result.customersRemaining === 0) break;
  }

  if (!lastResult) {
    return {
      retentionDays: retentionDaysFromEnv(),
      cutoff: subDays(new Date(), retentionDaysFromEnv()).toISOString(),
      expiredSmsTokens: 0,
      expiredSessions: 0,
      customersDeleted: 0,
      customersEligible: 0,
      customersRemaining: 0,
      batches: 0,
    };
  }

  return {
    retentionDays: lastResult.retentionDays,
    cutoff: lastResult.cutoff,
    expiredSmsTokens,
    expiredSessions,
    customersDeleted,
    customersEligible: lastResult.customersEligible,
    customersRemaining: lastResult.customersRemaining,
    batches,
  };
}

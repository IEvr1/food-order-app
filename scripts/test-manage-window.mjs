#!/usr/bin/env node
/**
 * Verifies customer manage-window logic for ASAP orders (no DB required).
 */
import { addMinutes } from "date-fns";
import {
  CUSTOMER_MODIFY_GRACE_MINUTES,
  canCustomerManageOrder,
  getCustomerManageUntil,
  getManageLinkTtlSeconds,
  isAsapOrder,
} from "../src/lib/order.ts";

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const shop = { prepMinutes: 25, deliveryPrepMinutes: 45 };
const now = new Date("2026-06-16T12:00:00.000Z");
const createdAt = now;
const requestedAt = now;

const order = {
  status: "CONFIRMED",
  requestedAt,
  createdAt,
  fulfillmentType: "PICKUP",
};

assert(isAsapOrder(order), "fresh ASAP order should be detected");
const manageUntil = getCustomerManageUntil(order, shop);
assert(
  manageUntil.getTime() === addMinutes(createdAt, CUSTOMER_MODIFY_GRACE_MINUTES).getTime(),
  "ASAP manage window should be createdAt + grace minutes",
);
assert(canCustomerManageOrder(order, shop, now), "should be manageable immediately after order");
assert(
  canCustomerManageOrder(order, shop, addMinutes(now, 3)),
  "should still be manageable 3 minutes later",
);
assert(
  !canCustomerManageOrder(order, shop, addMinutes(now, CUSTOMER_MODIFY_GRACE_MINUTES)),
  "should not be manageable after grace window ends",
);

const ttl = getManageLinkTtlSeconds(order, shop, "confirm", now);
assert(ttl >= 60, "manage link TTL should be at least 60 seconds");
assert(ttl > CUSTOMER_MODIFY_GRACE_MINUTES * 60, "manage link TTL should exceed grace window");

console.log("PASS: ASAP manage window and link TTL behave as expected");
console.log(`  manageUntil: ${manageUntil.toISOString()}`);
console.log(`  linkTtlSeconds: ${ttl}`);

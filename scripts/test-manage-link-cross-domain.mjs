#!/usr/bin/env node
/**
 * Legacy fallback: /api/orders/manage/enter still supports cross-origin redemption
 * if an old SMS used a different host before Option B (single domain) rollout.
 */
import { manageLinkEnterUrl } from "../src/lib/manage-link-redeem.ts";

const prevApp = process.env.APP_BASE_URL;
process.env.APP_BASE_URL = "https://foodorder.example.com";

const smsRequest = new Request("https://orders.example.com/l/Ab12Cd34");
const enterUrl = manageLinkEnterUrl(smsRequest, { code: "Ab12Cd34" });

if (!enterUrl.startsWith("https://foodorder.example.com/api/orders/manage/enter?code=Ab12Cd34")) {
  console.error("FAIL: enter URL should target APP_BASE_URL host");
  console.error("  got:", enterUrl);
  process.exit(1);
}

console.log("PASS: cross-domain manage link redirects through app enter endpoint");
console.log(`  enterUrl: ${enterUrl}`);

process.env.APP_BASE_URL = prevApp;

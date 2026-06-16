#!/usr/bin/env node
/**
 * Verifies cross-domain SMS link → app session exchange URL building.
 */
import { manageLinkEnterUrl } from "../src/lib/manage-link-redeem.ts";

const prevApp = process.env.APP_BASE_URL;
const prevSms = process.env.SMS_LINK_BASE_URL;

process.env.APP_BASE_URL = "https://foodorder.example.com";
process.env.SMS_LINK_BASE_URL = "https://orders.example.com";

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
process.env.SMS_LINK_BASE_URL = prevSms;

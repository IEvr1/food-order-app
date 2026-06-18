#!/usr/bin/env node
/**
 * Option B: SMS manage links must use the same origin as APP_BASE_URL.
 */
import { getAppBaseUrl, getSmsLinkBaseUrl, requestMatchesAppBase } from "../src/lib/sms-link-base.ts";

const prevApp = process.env.APP_BASE_URL;
process.env.APP_BASE_URL = "https://souvlaki.nexaipla.com";

const request = new Request("https://souvlaki.nexaipla.com/l/Ab12Cd34");
const appBase = getAppBaseUrl(request);
const smsBase = getSmsLinkBaseUrl(request);

if (appBase !== smsBase) {
  console.error("FAIL: getSmsLinkBaseUrl must match getAppBaseUrl");
  console.error(`  app: ${appBase}`);
  console.error(`  sms: ${smsBase}`);
  process.exit(1);
}

if (!requestMatchesAppBase(request)) {
  console.error("FAIL: manage link request on app host should match APP_BASE_URL");
  process.exit(1);
}

const manageUrl = `${smsBase}/l/Ab12Cd34`;
const expected = "https://souvlaki.nexaipla.com/l/Ab12Cd34";
if (manageUrl !== expected) {
  console.error("FAIL: unexpected manage URL shape");
  console.error(`  got: ${manageUrl}`);
  process.exit(1);
}

console.log("PASS: SMS links use the same domain as the app (Option B)");
console.log(`  manageUrl: ${manageUrl}`);

process.env.APP_BASE_URL = prevApp;

/**
 * Security & segregation audit for OrderApp.
 * Run with dev server: npm run dev (port 3002), then: node scripts/security-audit.mjs
 */
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3002";

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

const results = [];

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

async function fetchStatus(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual", ...options });
  return { status: res.status, res };
}

async function testDashboardAccessControl() {
  console.log("\n[1] Dashboard access control (proxy.ts)");

  const noCookie = await fetchStatus("/dashboard");
  if (noCookie.status === 401) pass("Dashboard without cookie returns 401");
  else fail("Dashboard without cookie returns 401", `got ${noCookie.status}`);

  const badCode = await fetchStatus("/dashboard?code=invalid.token.here");
  if (badCode.status === 401) pass("Dashboard with invalid code returns 401");
  else fail("Dashboard with invalid code returns 401", `got ${badCode.status}`);
}

async function testManageApiAuth() {
  console.log("\n[2] Customer manage API — session required");

  const routes = [
    { method: "GET", path: "/api/orders/manage/summary" },
    { method: "POST", path: "/api/orders/manage/cancel", body: {} },
    { method: "POST", path: "/api/orders/manage/modify", body: {} },
    { method: "POST", path: "/api/orders/manage/focus", body: { orderId: "fake-id" } },
  ];

  for (const route of routes) {
    const res = await fetch(`${BASE}${route.path}`, {
      method: route.method,
      headers: route.body ? { "Content-Type": "application/json" } : undefined,
      body: route.body ? JSON.stringify(route.body) : undefined,
    });
    if (res.status === 401) {
      pass(`${route.method} ${route.path} without session → 401`);
    } else {
      fail(`${route.method} ${route.path} without session → 401`, `got ${res.status}`);
    }
  }
}

async function testPublicApis() {
  console.log("\n[3] Public API endpoints");

  const menu = await fetchStatus("/api/menu");
  if (menu.status === 200) pass("GET /api/menu returns 200");
  else fail("GET /api/menu returns 200", `got ${menu.status}`);

  const today = new Date().toISOString().slice(0, 10);
  const avail = await fetchStatus(`/api/orders/availability?date=${today}`);
  if (avail.status === 200) pass("GET /api/orders/availability returns 200");
  else fail("GET /api/orders/availability returns 200", `got ${avail.status}`);

  const badDate = await fetchStatus("/api/orders/availability?date=not-a-date");
  if (badDate.status === 400) pass("Availability rejects invalid date with 400");
  else fail("Availability rejects invalid date with 400", `got ${badDate.status}`);
}

async function testOrderInputValidation() {
  console.log("\n[4] Order input validation & injection resistance");

  const invalidPhone = await fetch(`${BASE}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ menuItemId: "fake", quantity: 1 }],
      fulfillmentType: "PICKUP",
      requestedAt: new Date().toISOString(),
      name: "Test",
      phone: "123",
    }),
  });
  if (invalidPhone.status === 400) pass("Invalid phone rejected with 400");
  else fail("Invalid phone rejected with 400", `got ${invalidPhone.status}`);

  const sqlInject = await fetch(`${BASE}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ menuItemId: "'; DROP TABLE orders; --", quantity: 1 }],
      fulfillmentType: "PICKUP",
      requestedAt: new Date().toISOString(),
      name: "Robert'); DROP TABLE customers;--",
      phone: "99123456",
    }),
  });
  if (sqlInject.status === 400 || sqlInject.status === 409) {
    pass("SQL injection payload rejected safely", `status ${sqlInject.status}`);
  } else if (sqlInject.status === 502) {
    pass("SQL injection payload rejected (cart invalid)", `status ${sqlInject.status}`);
  } else {
    fail("SQL injection payload should not succeed", `got ${sqlInject.status}`);
  }

  const emptyCart = await fetch(`${BASE}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [],
      fulfillmentType: "PICKUP",
      requestedAt: new Date().toISOString(),
      name: "Test User",
      phone: "99123456",
    }),
  });
  if (emptyCart.status === 400) pass("Empty cart rejected with 400");
  else fail("Empty cart rejected with 400", `got ${emptyCart.status}`);
}

async function testDeliveryValidation() {
  console.log("\n[5] Delivery zone validation");

  const noCoords = await fetch(`${BASE}/api/orders/validate-delivery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat: 999, lng: 999 }),
  });
  if ([400, 422].includes(noCoords.status)) {
    pass("Out-of-zone / invalid delivery rejected", `status ${noCoords.status}`);
  } else {
    fail("Delivery validation should reject bad coords", `got ${noCoords.status}`);
  }
}

async function testShortLinkInvalid() {
  console.log("\n[6] Short link handling");

  const res = await fetchStatus("/l/ZZZZZZZZ");
  if (res.status === 307 || res.status === 302 || res.status === 308) {
    pass("Invalid short link redirects (no session issued)", `status ${res.status}`);
    const setCookie = res.res.headers.get("set-cookie") ?? "";
    if (!setCookie.includes("shop_manage_session=")) {
      pass("Invalid short link does not set manage session cookie");
    } else {
      fail("Invalid short link should not set manage session cookie");
    }
  } else {
    fail("Invalid short link should redirect", `got ${res.status}`);
  }
}

async function testPrivacyPage() {
  console.log("\n[7] Privacy & GDPR page");

  const res = await fetchStatus("/privacy");
  if (res.status === 200) pass("Privacy page accessible at /privacy");
  else fail("Privacy page accessible", `got ${res.status}`);
}

async function testDashboardAuthModule() {
  console.log("\n[8] Dashboard auth module (unit checks)");

  const { createDashboardAccessCode, verifyDashboardAccessCode } = await import(
    "../src/lib/dashboard-auth.ts"
  );

  const { code } = await createDashboardAccessCode({ ttlSeconds: 3600 });
  const verified = await verifyDashboardAccessCode(code);
  if (verified) pass("Dashboard code sign/verify round-trip");
  else fail("Dashboard code sign/verify round-trip");

  const tampered = code.slice(0, -4) + "XXXX";
  const bad = await verifyDashboardAccessCode(tampered);
  if (!bad) pass("Tampered dashboard code rejected");
  else fail("Tampered dashboard code should be rejected");

  const empty = await verifyDashboardAccessCode("");
  if (!empty) pass("Empty dashboard code rejected");
  else fail("Empty dashboard code should be rejected");
}

async function testManageSessionSegregation() {
  console.log("\n[9] Manage session cookie forgery resistance");

  const fakeCookie =
    "shop_manage_session=" +
    encodeURIComponent(
      Buffer.from(JSON.stringify({ shopId: "fake", phoneE164: "+35799123456" })).toString(
        "base64url",
      ),
    );

  const res = await fetch(`${BASE}/api/orders/manage/summary`, {
    headers: { Cookie: fakeCookie },
  });
  if (res.status === 401) pass("Forged manage session cookie rejected");
  else fail("Forged manage session cookie should be rejected", `got ${res.status}`);
}

async function testOrderFlowAndDataSegregation() {
  console.log("\n[10] Order flow & customer data segregation (integration)");

  const menuRes = await fetch(`${BASE}/api/menu`);
  if (!menuRes.ok) {
    fail("Integration: load menu for order test", `status ${menuRes.status}`);
    return;
  }
  const menu = await menuRes.json();
  const item = menu.categories?.[0]?.items?.[0];
  if (!item?.id) {
    fail("Integration: menu has items");
    return;
  }
  pass("Integration: menu loaded with items");

  const today = new Date().toISOString().slice(0, 10);
  let slot = null;
  for (let dayOffset = 0; dayOffset < 7 && !slot; dayOffset += 1) {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    const dateIso = d.toISOString().slice(0, 10);
    const slotsRes = await fetch(`${BASE}/api/orders/availability?date=${dateIso}`);
    const slotsData = await slotsRes.json();
    slot = slotsData.slots?.[0] ?? null;
    if (slot) break;
  }
  if (!slot) {
    console.log("  ⚠ Skipping order creation — no available slots in next 7 days");
    return;
  }

  const testPhone = `99${String(Date.now()).slice(-6)}`;
  const orderRes = await fetch(`${BASE}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ menuItemId: item.id, quantity: 1 }],
      fulfillmentType: "PICKUP",
      requestedAt: slot.iso,
      name: "Security Audit Test",
      phone: testPhone,
      lang: "en",
    }),
  });

  if (!orderRes.ok) {
    fail("Integration: create test order", `status ${orderRes.status}`);
    return;
  }
  const order = await orderRes.json();
  pass("Integration: order created", `orderNumber ${order.orderNumber}`);

  if (!order.manageUrl) {
    fail("Integration: order response includes manageUrl");
    return;
  }
  pass("Integration: manageUrl returned to customer");

  const linkRes = await fetch(order.manageUrl, { redirect: "manual" });
  const setCookie = linkRes.headers.get("set-cookie") ?? "";
  const sessionMatch = setCookie.match(/shop_manage_session=([^;]+)/);
  if (!sessionMatch) {
    fail("Integration: manage link sets session cookie");
    return;
  }
  const sessionCookie = `shop_manage_session=${sessionMatch[1]}`;
  pass("Integration: manage link establishes session");

  const summaryRes = await fetch(`${BASE}/api/orders/manage/summary?lang=en`, {
    headers: { Cookie: sessionCookie },
  });
  if (summaryRes.status !== 200) {
    fail("Integration: summary with valid session", `status ${summaryRes.status}`);
    return;
  }
  const summary = await summaryRes.json();
  const summaryText = JSON.stringify(summary);
  if (/customerPhone|phoneE164|"phone"/i.test(summaryText)) {
    fail("Integration: manage summary must not expose phone numbers");
  } else {
    pass("Integration: manage summary does not expose phone numbers");
  }

  if (summary.order?.orderNumber === order.orderNumber) {
    pass("Integration: summary scoped to correct order");
  } else {
    fail("Integration: summary order mismatch");
  }

  const focusRes = await fetch(`${BASE}/api/orders/manage/focus`, {
    method: "POST",
    headers: { Cookie: sessionCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ orderId: "00000000-0000-0000-0000-000000000000" }),
  });
  if (focusRes.status === 403 || focusRes.status === 404) {
    pass("Integration: focus on foreign order rejected", `status ${focusRes.status}`);
  } else {
    fail("Integration: focus on foreign order should be rejected", `got ${focusRes.status}`);
  }

  const noSessionSummary = await fetch(`${BASE}/api/orders/manage/summary`);
  if (noSessionSummary.status === 401) {
    pass("Integration: summary without cookie still blocked after flow");
  } else {
    fail("Integration: summary without cookie blocked", `got ${noSessionSummary.status}`);
  }
}

async function testDashboardValidLink() {
  console.log("\n[11] Dashboard valid link flow");

  try {
    const crypto = await import("node:crypto");
    const secret =
      process.env.DASHBOARD_LINK_SECRET?.trim() ||
      (process.env.NODE_ENV === "production" ? "" : "dev-dashboard-link-secret");
    if (!secret) {
      fail("Dashboard valid link flow", "DASHBOARD_LINK_SECRET not set");
      return;
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    const payload = { purpose: "dashboard", iat: nowSeconds, nonce: crypto.randomUUID() };
    const payloadPart = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = crypto.createHmac("sha256", secret).update(payloadPart).digest("base64url");
    const code = `${payloadPart}.${signature}`;

    const res = await fetch(`${BASE}/dashboard?code=${encodeURIComponent(code)}`, {
      redirect: "manual",
    });
    if (res.status === 307 || res.status === 302) {
      pass("Valid dashboard code redirects and sets cookie");
      const cookie = res.headers.get("set-cookie") ?? "";
      if (cookie.includes("dashboard_access=")) {
        pass("Valid dashboard code sets dashboard_access cookie");
      } else {
        fail("Valid dashboard code should set dashboard_access cookie");
      }
    } else {
      fail("Valid dashboard code should redirect", `got ${res.status}`);
    }
  } catch (e) {
    fail("Dashboard valid link flow", e.message);
  }
}

async function testPiiNotInPublicMenu() {
  console.log("\n[12] PII not exposed in public APIs");

  const menuRes = await fetch(`${BASE}/api/menu`);
  const text = await menuRes.text();
  const piiPatterns = [
    /phoneE164/i,
    /customerPhone/i,
    /deliveryAddress/i,
    /"customers"/i,
  ];
  let leaked = false;
  for (const pat of piiPatterns) {
    if (pat.test(text)) {
      fail("Public menu should not expose customer PII", pat.toString());
      leaked = true;
    }
  }
  if (!leaked) pass("Public menu does not expose customer PII fields");
}

async function main() {
  console.log(`OrderApp security audit → ${BASE}\n`);

  try {
    const health = await fetch(`${BASE}/api/menu`, { signal: AbortSignal.timeout(5000) });
    if (!health.ok && health.status !== 200) throw new Error(`Server not ready (${health.status})`);
  } catch (e) {
    console.error(`Cannot reach ${BASE}. Start dev server: npm run dev`);
    console.error(e.message);
    process.exit(1);
  }

  await testDashboardAccessControl();
  await testManageApiAuth();
  await testPublicApis();
  await testOrderInputValidation();
  await testDeliveryValidation();
  await testShortLinkInvalid();
  await testPrivacyPage();
  await testManageSessionSegregation();
  await testOrderFlowAndDataSegregation();
  await testDashboardValidLink();
  await testPiiNotInPublicMenu();

  try {
    await testDashboardAuthModule();
  } catch (e) {
    fail("Dashboard auth module unit checks", e.message);
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n" + "─".repeat(50));
  console.log(`Results: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("\nFailed checks:");
    for (const f of failed) console.log(`  • ${f.name}: ${f.detail}`);
    process.exit(1);
  }
  console.log("\nAll security checks passed.");
}

main();

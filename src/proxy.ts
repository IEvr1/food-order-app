import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  DASHBOARD_ACCESS_COOKIE,
  DELIVERY_ACCESS_COOKIE,
  accessCookieOptions,
  resolveLinkAccessCode,
  verifyDashboardAccessCode,
  verifyDeliveryAccessCode,
} from "@/lib/dashboard-auth";

function isDeliveryRoute(pathname: string): boolean {
  return pathname === "/dashboard/delivery" || pathname.startsWith("/dashboard/delivery/");
}

/** Next.js 16 entry: dashboard access through signed business link codes. */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/dashboard")) {
    return NextResponse.next();
  }

  const code = request.nextUrl.searchParams.get("code")?.trim();
  if (code) {
    const resolved = await resolveLinkAccessCode(code);
    if (!resolved) {
      return new NextResponse("Dashboard link is invalid or expired", { status: 401 });
    }

    if (resolved.purpose === "delivery" && !isDeliveryRoute(pathname)) {
      return new NextResponse("Delivery link cannot access this page", { status: 401 });
    }

    const cleanUrl = request.nextUrl.clone();
    cleanUrl.searchParams.delete("code");
    const response = NextResponse.redirect(cleanUrl);
    const cookieName =
      resolved.purpose === "delivery" ? DELIVERY_ACCESS_COOKIE : DASHBOARD_ACCESS_COOKIE;
    response.cookies.set(cookieName, resolved.code, accessCookieOptions(resolved.verified));
    return response;
  }

  if (isDeliveryRoute(pathname)) {
    const deliveryCode = request.cookies.get(DELIVERY_ACCESS_COOKIE)?.value;
    const deliveryVerified = await verifyDeliveryAccessCode(deliveryCode);
    const dashboardCode = request.cookies.get(DASHBOARD_ACCESS_COOKIE)?.value;
    const dashboardVerified = await verifyDashboardAccessCode(dashboardCode);

    if (!deliveryVerified && !dashboardVerified) {
      return new NextResponse("Delivery link is required or has expired", { status: 401 });
    }

    const response = NextResponse.next();
    if (deliveryVerified && deliveryCode) {
      response.cookies.set(
        DELIVERY_ACCESS_COOKIE,
        deliveryCode,
        accessCookieOptions(deliveryVerified),
      );
    }
    if (dashboardVerified && dashboardCode) {
      response.cookies.set(
        DASHBOARD_ACCESS_COOKIE,
        dashboardCode,
        accessCookieOptions(dashboardVerified),
      );
    }
    return response;
  }

  const cookieCode = request.cookies.get(DASHBOARD_ACCESS_COOKIE)?.value;
  const verified = await verifyDashboardAccessCode(cookieCode);
  if (!verified) {
    return new NextResponse("Dashboard link is required or has expired", { status: 401 });
  }

  const response = NextResponse.next();
  if (cookieCode) {
    response.cookies.set(DASHBOARD_ACCESS_COOKIE, cookieCode, accessCookieOptions(verified));
  }
  return response;
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*"],
};

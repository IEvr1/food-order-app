import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  DASHBOARD_ACCESS_COOKIE,
  dashboardAccessCookieOptions,
  verifyDashboardAccessCode,
} from "@/lib/dashboard-auth";

/** Next.js 16 entry: dashboard access through a signed business link code. */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/dashboard")) {
    return NextResponse.next();
  }

  const code = request.nextUrl.searchParams.get("code")?.trim();
  if (code) {
    const verified = await verifyDashboardAccessCode(code);
    if (!verified) {
      return new NextResponse("Dashboard link is invalid or expired", { status: 401 });
    }

    const cleanUrl = request.nextUrl.clone();
    cleanUrl.searchParams.delete("code");
    const response = NextResponse.redirect(cleanUrl);
    response.cookies.set(DASHBOARD_ACCESS_COOKIE, code, dashboardAccessCookieOptions(verified));
    return response;
  }

  const cookieCode = request.cookies.get(DASHBOARD_ACCESS_COOKIE)?.value;
  const verified = await verifyDashboardAccessCode(cookieCode);
  if (!verified) {
    return new NextResponse("Dashboard link is required or has expired", { status: 401 });
  }

  const response = NextResponse.next();
  if (cookieCode) {
    response.cookies.set(
      DASHBOARD_ACCESS_COOKIE,
      cookieCode,
      dashboardAccessCookieOptions(verified),
    );
  }
  return response;
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*"],
};

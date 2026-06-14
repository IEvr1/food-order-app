import { NextResponse } from "next/server";
import { resolveManagePayloadByShortCode } from "@/lib/deep-link-token";
import { MANAGE_SESSION_COOKIE, signManageSessionCookieValue } from "@/lib/manage-session";
import { getAppBaseUrl } from "@/lib/sms-link-base";

type RouteParams = {
  params: Promise<{ code: string }>;
};

export async function GET(request: Request, { params }: RouteParams) {
  const base = getAppBaseUrl(request);
  try {
    const { code } = await params;
    const payload = await resolveManagePayloadByShortCode(code);
    const { linkExpiresAt, ...sessionPayload } = payload;
    const remainingSec = Math.max(
      60,
      Math.min(7 * 24 * 60 * 60, Math.floor((linkExpiresAt.getTime() - Date.now()) / 1000)),
    );

    const session = signManageSessionCookieValue(sessionPayload, remainingSec);

    const url = new URL("/chat", base);
    url.searchParams.set("fromLink", "1");

    const res = NextResponse.redirect(url);
    res.cookies.set(MANAGE_SESSION_COOKIE, session, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: remainingSec,
    });
    return res;
  } catch {
    return NextResponse.redirect(new URL("/chat", base));
  }
}

import { NextResponse } from "next/server";
import {
  manageLinkRemainingSeconds,
  resolveManagePayloadByShortCode,
  verifyDeepLinkToken,
} from "@/lib/deep-link-token";
import { MANAGE_SESSION_COOKIE, signManageSessionCookieValue, type ManageSessionPayload } from "@/lib/manage-session";
import { getAppBaseUrl } from "@/lib/sms-link-base";

export type RedeemedManageLink = {
  session: ManageSessionPayload;
  linkExpiresAt: Date;
};

export async function redeemManageLinkByCode(code: string): Promise<RedeemedManageLink> {
  const payload = await resolveManagePayloadByShortCode(code);
  const { linkExpiresAt, ...session } = payload;
  return { session, linkExpiresAt };
}

export async function redeemManageLinkByToken(token: string): Promise<RedeemedManageLink> {
  const decoded = await verifyDeepLinkToken(token);
  const { linkExpiresAt, ...session } = decoded;
  return {
    session: {
      shopId: session.shopId,
      phoneE164: session.phoneE164,
      orderId: session.orderId,
    },
    linkExpiresAt,
  };
}

export function manageSessionRedirectResponse(
  request: Request,
  redeemed: RedeemedManageLink,
): NextResponse {
  const appBase = getAppBaseUrl(request);
  const remainingSec = manageLinkRemainingSeconds(redeemed.linkExpiresAt);
  const session = signManageSessionCookieValue(redeemed.session, remainingSec);

  const url = new URL("/chat", appBase);
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
}

export function manageLinkEnterUrl(request: Request, params: { code?: string; token?: string }): string {
  const appBase = getAppBaseUrl(request);
  const url = new URL("/api/orders/manage/enter", appBase);
  if (params.code) {
    url.searchParams.set("code", params.code);
  }
  if (params.token) {
    url.searchParams.set("token", params.token);
  }
  return url.toString();
}

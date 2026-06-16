import { NextResponse } from "next/server";
import { verifyDeepLinkToken } from "@/lib/deep-link-token";
import { isLinkPreviewBot } from "@/lib/link-preview-bot";
import { MANAGE_SESSION_COOKIE, signManageSessionCookieValue } from "@/lib/manage-session";
import { prisma } from "@/lib/prisma";
import { smsLinkPreviewResponse } from "@/lib/sms-link-preview";
import { getAppBaseUrl } from "@/lib/sms-link-base";

type RouteParams = {
  params: Promise<{ token: string }>;
};

export async function GET(request: Request, { params }: RouteParams) {
  const base = getAppBaseUrl(request);
  try {
    const { token } = await params;
    const decoded = await verifyDeepLinkToken(token);

    if (isLinkPreviewBot(request)) {
      const shop = await prisma.shop.findUnique({
        where: { id: decoded.shopId },
        select: { name: true },
      });
      const title = shop?.name
        ? `${shop.name} — Διαχείριση παραγγελίας`
        : "Διαχείριση παραγγελίας";
      return smsLinkPreviewResponse(title);
    }

    const session = signManageSessionCookieValue({
      shopId: decoded.shopId,
      phoneE164: decoded.phoneE164,
      orderId: decoded.orderId,
    });

    const url = new URL("/chat", base);
    url.searchParams.set("fromLink", "1");

    const res = NextResponse.redirect(url);
    res.cookies.set(MANAGE_SESSION_COOKIE, session, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 30 * 60,
    });
    return res;
  } catch {
    return NextResponse.redirect(new URL("/chat", base));
  }
}

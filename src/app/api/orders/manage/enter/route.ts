import { NextResponse } from "next/server";
import { isLinkPreviewBot } from "@/lib/link-preview-bot";
import {
  manageLinkEnterUrl,
  manageSessionRedirectResponse,
  redeemManageLinkByCode,
  redeemManageLinkByToken,
} from "@/lib/manage-link-redeem";
import { prisma } from "@/lib/prisma";
import { smsLinkPreviewResponse } from "@/lib/sms-link-preview";
import { getAppBaseUrl } from "@/lib/sms-link-base";

export async function GET(request: Request) {
  const base = getAppBaseUrl(request);
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code")?.trim();
  const token = searchParams.get("token")?.trim();

  if (!code && !token) {
    return NextResponse.redirect(new URL("/chat", base));
  }

  try {
    const redeemed = code
      ? await redeemManageLinkByCode(code)
      : await redeemManageLinkByToken(token!);

    if (isLinkPreviewBot(request)) {
      const shop = await prisma.shop.findUnique({
        where: { id: redeemed.session.shopId },
        select: { name: true },
      });
      const title = shop?.name
        ? `${shop.name} — Διαχείριση παραγγελίας`
        : "Διαχείριση παραγγελίας";
      return smsLinkPreviewResponse(title);
    }

    return manageSessionRedirectResponse(request, redeemed);
  } catch {
    return NextResponse.redirect(new URL("/chat", base));
  }
}

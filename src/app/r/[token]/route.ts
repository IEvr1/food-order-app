import { NextResponse } from "next/server";
import { isLinkPreviewBot } from "@/lib/link-preview-bot";
import {
  manageLinkEnterUrl,
  manageSessionRedirectResponse,
  redeemManageLinkByToken,
} from "@/lib/manage-link-redeem";
import { prisma } from "@/lib/prisma";
import { smsLinkPreviewResponse } from "@/lib/sms-link-preview";
import { getAppBaseUrl, requestMatchesAppBase } from "@/lib/sms-link-base";

type RouteParams = {
  params: Promise<{ token: string }>;
};

export async function GET(request: Request, { params }: RouteParams) {
  const base = getAppBaseUrl(request);
  try {
    const { token } = await params;

    if (!requestMatchesAppBase(request)) {
      if (isLinkPreviewBot(request)) {
        try {
          const redeemed = await redeemManageLinkByToken(token);
          const shop = await prisma.shop.findUnique({
            where: { id: redeemed.session.shopId },
            select: { name: true },
          });
          const title = shop?.name
            ? `${shop.name} — Διαχείριση παραγγελίας`
            : "Διαχείριση παραγγελίας";
          return smsLinkPreviewResponse(title);
        } catch {
          return smsLinkPreviewResponse("Διαχείριση παραγγελίας");
        }
      }
      return NextResponse.redirect(manageLinkEnterUrl(request, { token }));
    }

    const redeemed = await redeemManageLinkByToken(token);

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

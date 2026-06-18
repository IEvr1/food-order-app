import { NextResponse } from "next/server";
import { isLinkPreviewBot } from "@/lib/link-preview-bot";
import {
  manageLinkEnterUrl,
  manageSessionRedirectResponse,
  redeemManageLinkByCode,
} from "@/lib/manage-link-redeem";
import { prisma } from "@/lib/prisma";
import { smsLinkPreviewResponse } from "@/lib/sms-link-preview";
import { getAppBaseUrl, requestMatchesAppBase } from "@/lib/sms-link-base";

type RouteParams = {
  params: Promise<{ code: string }>;
};

export async function GET(request: Request, { params }: RouteParams) {
  const base = getAppBaseUrl(request);
  try {
    const { code } = await params;

    if (!requestMatchesAppBase(request)) {
      if (isLinkPreviewBot(request)) {
        try {
          const redeemed = await redeemManageLinkByCode(code);
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
      return NextResponse.redirect(manageLinkEnterUrl(request, { code }));
    }

    const redeemed = await redeemManageLinkByCode(code);

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

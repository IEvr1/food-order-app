import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getManageSessionPayload } from "@/lib/manage-from-request";
import {
  MANAGE_SESSION_COOKIE,
  signManageSessionCookieValue,
} from "@/lib/manage-session";
import { prisma } from "@/lib/prisma";

const schema = z.object({ orderId: z.string().min(1) });

export async function POST(request: Request) {
  const session = await getManageSessionPayload();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: z.infer<typeof schema>;
  try {
    payload = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const order = await prisma.order.findFirst({
    where: { id: payload.orderId, shopId: session.shopId },
    include: { customer: true },
  });

  if (!order || order.customer.phoneE164 !== session.phoneE164) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const value = signManageSessionCookieValue({
    shopId: session.shopId,
    phoneE164: session.phoneE164,
    orderId: order.id,
  });

  const jar = await cookies();
  jar.set(MANAGE_SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 60,
  });

  return NextResponse.json({ ok: true, orderId: order.id });
}

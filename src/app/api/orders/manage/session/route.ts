import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getManageSessionPayload } from "@/lib/manage-from-request";
import { MANAGE_SESSION_COOKIE, signManageSessionCookieValue } from "@/lib/manage-session";

export async function POST() {
  const session = await getManageSessionPayload();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const value = signManageSessionCookieValue({
    shopId: session.shopId,
    phoneE164: session.phoneE164,
  });

  const jar = await cookies();
  jar.set(MANAGE_SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 60,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const jar = await cookies();
  jar.delete(MANAGE_SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { runRetentionCleanupFully } from "@/lib/retention-cleanup";

function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runRetentionCleanupFully();
  console.info("[cron/retention]", result);

  return NextResponse.json({
    ok: true,
    ...result,
  });
}

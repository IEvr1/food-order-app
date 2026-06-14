import { cookies } from "next/headers";
import {
  MANAGE_SESSION_COOKIE,
  parseManageSessionCookieValue,
  type ManageSessionPayload,
} from "@/lib/manage-session";

export async function getManageSessionPayload(): Promise<ManageSessionPayload | null> {
  const jar = await cookies();
  const raw = jar.get(MANAGE_SESSION_COOKIE)?.value;
  if (!raw) {
    return null;
  }
  return parseManageSessionCookieValue(raw);
}

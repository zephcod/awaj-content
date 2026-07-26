/**
 * Resolve the ManagedPage a client session is allowed to see.
 * Returns null when the session is missing or the page isn't in the
 * scheduler's configured page list.
 */

import { cookies } from "next/headers";
import {
  CLIENT_COOKIE,
  verifyClientToken,
  type ClientSession,
} from "./clientsession";
import { listPages, type ManagedPage } from "./pages";

export async function getClientPage(): Promise<{
  session: ClientSession;
  page: ManagedPage;
} | null> {
  const token = (await cookies()).get(CLIENT_COOKIE)?.value;
  const session = token ? await verifyClientToken(token) : null;
  if (!session) return null;
  const page = (await listPages()).find((p) => p.id === session.pageId);
  if (!page) return null;
  return { session, page };
}

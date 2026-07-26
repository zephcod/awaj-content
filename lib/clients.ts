/**
 * Client lookup against the reports app's `companies` collection —
 * same Appwrite database, same PINs clients already use for reports.
 * The scheduler adds one optional attribute: `fbPageId` (see
 * scripts/setup-client-portal.mjs).
 */

import { Client, Databases, Query } from "node-appwrite";
import { env } from "./env";

const COMPANIES = "companies";

export type Company = {
  $id: string;
  name: string;
  pin: string;
  active: boolean;
  /** FB page this company's posts are viewable for (scheduler addition). */
  fbPageId?: string;
};

let _db: Databases | null = null;

function db(): Databases {
  if (_db) return _db;
  const client = new Client()
    .setEndpoint(env.appwriteEndpoint())
    .setProject(env.appwriteProjectId())
    .setKey(env.appwriteApiKey());
  _db = new Databases(client);
  return _db;
}

/** Active company matching this PIN, or null. */
export async function getCompanyByPin(pin: string): Promise<Company | null> {
  const res = await db().listDocuments(env.appwriteDatabaseId(), COMPANIES, [
    Query.equal("pin", pin),
    Query.equal("active", true),
    Query.limit(1),
  ]);
  return (res.documents[0] as unknown as Company) ?? null;
}

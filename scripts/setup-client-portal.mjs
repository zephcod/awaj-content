/**
 * One-time setup for the client portal: adds the optional `fbPageId`
 * attribute to the reports app's `companies` collection (same Appwrite
 * database — the reports app ignores the extra attribute).
 *
 * Run from the project root:  node scripts/setup-client-portal.mjs
 * Then set fbPageId per client company (Appwrite console → companies),
 * using the same page ids as FB_PAGE_IDS in .env.
 */

import { readFileSync } from "node:fs";
import { Client, Databases } from "node-appwrite";

const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
const env = {};
for (const line of raw.split("\n")) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}

for (const k of [
  "APPWRITE_ENDPOINT",
  "APPWRITE_PROJECT_ID",
  "APPWRITE_API_KEY",
  "APPWRITE_DATABASE_ID",
]) {
  if (!env[k]) {
    console.error(`❌ Missing ${k} in .env`);
    process.exit(1);
  }
}

const client = new Client()
  .setEndpoint(env.APPWRITE_ENDPOINT)
  .setProject(env.APPWRITE_PROJECT_ID)
  .setKey(env.APPWRITE_API_KEY);
const db = new Databases(client);

try {
  await db.createStringAttribute(
    env.APPWRITE_DATABASE_ID,
    "companies",
    "fbPageId",
    64,
    false
  );
  console.log("✅ Added fbPageId attribute to companies");
} catch (e) {
  if (e?.code === 409) console.log("• fbPageId already exists on companies");
  else if (e?.code === 404) {
    console.error(
      "❌ companies collection not found — is APPWRITE_DATABASE_ID the same database the reports app uses?"
    );
    process.exit(1);
  } else throw e;
}

console.log(
  "\n🎉 Done. Now set fbPageId on each client company (Appwrite console\n" +
  "   → companies) — clients then log in here with their reports PIN.\n"
);

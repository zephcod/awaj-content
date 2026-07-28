/**
 * One-time setup: creates the `li_connections` and `li_queue`
 * collections in Appwrite, plus a fresh public-read bucket for staging
 * LinkedIn media. Run from the project root:  node scripts/setup-li-db.mjs
 * Reads APPWRITE_* vars from .env, and prints the new bucket id to paste
 * into .env as LI_MEDIA_BUCKET_ID (unlike IG, there's no existing bucket
 * to reuse here — see lib/storage.ts).
 */

import { readFileSync } from "node:fs";
import { Client, Databases, Storage, ID } from "node-appwrite";

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
const DB = env.APPWRITE_DATABASE_ID;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureCollection(id, name, attrs, indexKey, indexFields) {
  try {
    await db.createCollection(DB, id, name);
    console.log(`✅ Created collection ${id}`);
  } catch (e) {
    if (e?.code === 409) console.log(`• Collection ${id} already exists`);
    else throw e;
  }

  for (const [type, key, size, required] of attrs) {
    try {
      if (type === "string") {
        await db.createStringAttribute(DB, id, key, size, required);
      } else {
        await db.createIntegerAttribute(DB, id, key, required);
      }
      console.log(`✅ Attribute ${id}.${key}`);
    } catch (e) {
      if (e?.code === 409) console.log(`• Attribute ${id}.${key} already exists`);
      else throw e;
    }
    await sleep(400);
  }

  try {
    await sleep(1500); // attributes must finish processing first
    await db.createIndex(DB, id, indexKey, "key", indexFields);
    console.log(`✅ Index ${id}.${indexKey}`);
  } catch (e) {
    if (e?.code === 409) console.log(`• Index ${id}.${indexKey} already exists`);
    else console.log(`⚠️  Index creation on ${id}: ${e.message} (create manually if queries are slow)`);
  }
}

// ── li_connections: one row per connected LinkedIn organization ──
await ensureCollection(
  "li_connections",
  "LinkedIn Connections",
  [
    ["string", "orgUrn", 128, true],
    ["string", "orgName", 256, true],
    ["string", "accessToken", 2000, true],
    ["integer", "accessTokenExpiresAt", true],
    ["string", "refreshToken", 2000, false],
    ["integer", "refreshTokenExpiresAt", false],
    ["string", "connectedByName", 256, false],
    ["integer", "connectedAt", true],
  ],
  "org_idx",
  ["orgUrn"]
);

// ── li_queue: scheduled LinkedIn posts, mirrors ig_queue ──
await ensureCollection(
  "li_queue",
  "LinkedIn Queue",
  [
    ["string", "orgUrn", 128, true],
    ["string", "orgName", 256, false],
    ["string", "caption", 3000, false],
    ["string", "mediaType", 16, true], // text | image | multiImage | video
    ["string", "mediaRefs", 2000, false], // JSON array of Appwrite file ids
    ["string", "mediaContentType", 64, false],
    ["integer", "scheduledAt", true],
    ["string", "status", 16, true],
    ["string", "error", 500, false],
    ["string", "liPostId", 128, false],
  ],
  "due_idx",
  ["status", "scheduledAt"]
);

// ── Public-read bucket for staging LinkedIn media ──
// Unlike ig_media (an existing bucket reused across projects), there's
// no pre-existing LinkedIn bucket — this creates a fresh one and prints
// its id to paste into .env as LI_MEDIA_BUCKET_ID.
const storage = new Storage(client);
const BUCKET_NAME = "li_media";
try {
  const existing = await storage.listBuckets([], BUCKET_NAME);
  const found = existing.buckets?.find((b) => b.name === BUCKET_NAME);
  if (found) {
    console.log(`• Bucket "${BUCKET_NAME}" already exists — id: ${found.$id}`);
    console.log(`  Make sure LI_MEDIA_BUCKET_ID=${found.$id} is set in .env.`);
  } else {
    const bucket = await storage.createBucket(
      ID.unique(),
      BUCKET_NAME,
      ['read("any")'], // public read — LinkedIn's upload step isn't involved here,
      // but downloadLiMedia() in lib/storage.ts reads the raw bytes back
      // out at publish time using the API key, so public read isn't
      // strictly required — kept for parity/debuggability with ig_media.
      false
    );
    console.log(`✅ Created bucket "${BUCKET_NAME}" — id: ${bucket.$id}`);
    console.log(`\n👉 Add this to .env:\n   LI_MEDIA_BUCKET_ID=${bucket.$id}\n`);
  }
} catch (e) {
  console.log(`⚠️  Could not create/verify bucket "${BUCKET_NAME}": ${e.message}`);
}

console.log("\n🎉 li_connections and li_queue are ready.\n");

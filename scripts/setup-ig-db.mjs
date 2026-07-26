/**
 * One-time setup: creates the `ig_queue` collection in Appwrite.
 * Run from the project root:  node scripts/setup-ig-db.mjs
 * Reads APPWRITE_* vars from .env.
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
const DB = env.APPWRITE_DATABASE_ID;
const COLL = "ig_queue";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await db.createCollection(DB, COLL, "IG Queue");
  console.log("✅ Created collection ig_queue");
} catch (e) {
  if (e?.code === 409) console.log("• Collection ig_queue already exists");
  else throw e;
}

const attrs = [
  ["string", "pageId", 64, true],
  ["string", "igUserId", 64, true],
  ["string", "igUsername", 128, false],
  ["string", "caption", 2200, false],
  ["string", "fbPhotoId", 64, true],
  ["string", "mediaType", 16, false], // image | carousel | reel
  ["string", "mediaRefs", 2000, false], // JSON array of media refs
  ["integer", "scheduledAt", null, true],
  ["string", "status", 16, true],
  ["string", "error", 500, false],
  ["string", "igMediaId", 64, false],
];

for (const [type, key, size, required] of attrs) {
  try {
    if (type === "string") {
      await db.createStringAttribute(DB, COLL, key, size, required);
    } else {
      await db.createIntegerAttribute(DB, COLL, key, required);
    }
    console.log(`✅ Attribute ${key}`);
  } catch (e) {
    if (e?.code === 409) console.log(`• Attribute ${key} already exists`);
    else throw e;
  }
  await sleep(400);
}

// Index for the due-post query (status + scheduledAt)
try {
  await sleep(1500); // attributes must finish processing first
  await db.createIndex(DB, COLL, "due_idx", "key", ["status", "scheduledAt"]);
  console.log("✅ Index due_idx");
} catch (e) {
  if (e?.code === 409) console.log("• Index due_idx already exists");
  else console.log(`⚠️  Index creation: ${e.message} (create manually if queries are slow)`);
}

// ── Public-read bucket for Instagram Reels video hosting ──
// Reusing an existing bucket (id below) rather than creating a new one —
// this Appwrite project's plan caps the number of buckets. It must have
// `read(any)` permission (and fileSecurity off, or per-file public read)
// so Instagram can fetch the uploaded video URL.
const IG_MEDIA_BUCKET_ID = "658477e7eef2f71d1693";
const { Storage } = await import("node-appwrite");
const storage = new Storage(client);
try {
  const bucket = await storage.getBucket(IG_MEDIA_BUCKET_ID);
  const publicRead = bucket.$permissions.includes('read("any")');
  console.log(
    publicRead
      ? `✅ Bucket ${IG_MEDIA_BUCKET_ID} (${bucket.name}) has public read`
      : `⚠️  Bucket ${IG_MEDIA_BUCKET_ID} (${bucket.name}) lacks read("any") — Reel publishing will fail`
  );
} catch (e) {
  console.log(`⚠️  Could not verify bucket ${IG_MEDIA_BUCKET_ID}: ${e.message}`);
}

console.log("\n🎉 ig_queue is ready.\n");

# Awaj ET — FB Scheduler

Multi-page Facebook post scheduler built on the Meta Graph API. Same
stack and auth pattern as `awaj-leads` (Next.js 15 App Router, Tailwind
4, shared-password login). No database — Facebook itself holds the
schedule (`published=false` + `scheduled_publish_time`), so no cron job
is needed.

## Features

- **Multi-page** — manage any number of pages (yours + clients') from
  one system-user token; switch pages in the sidebar
- **Facebook + Instagram** — cross-post from one composer; IG requires
  media and a linked IG professional account
- **Media** — text, single photo, multi-photo (2–10 → FB multi-photo
  post / IG carousel), or one video (FB video post / IG Reel)
- **Calendar** — monthly grid of scheduled + published posts, both
  platforms; hover a day and hit + to compose for it
- **Compose** — publish immediately or schedule
  (10 minutes to 75 days out, enforced client + server side)
- **Scheduled** — Facebook's native queue plus the app-managed
  Instagram queue, with reschedule, publish-now/retry, and delete
- **Published** — recent FB posts with engagement + IG media grid
- **Insights** — follower counts, daily reach/engagement charts (7/28
  days), and top posts per platform (`read_insights` permission)
- **Client portal** — read-only view at `/client`: clients log in with
  the SAME PIN as the reports app (shared `companies` collection) and
  get a sidebar with Posts, Calendar, and Insights for their page only.
  No editing, no failure internals, no other pages.
- Times displayed in Ethiopia time (EAT)

### Client portal setup

1. `node scripts/setup-client-portal.mjs` — adds an optional `fbPageId`
   attribute to the reports app's `companies` collection (reports app
   ignores it).
2. In the Appwrite console, set `fbPageId` on each client company to
   their page id (must also be in `FB_PAGE_IDS`).
3. Clients visit the scheduler URL and enter their reports PIN in the
   normal login box — team password still routes to the team app.
   Client sessions are HMAC-signed cookies scoped to that one page
   (same scheme as the reports app; rotating `AUTH_SECRET` revokes all).

## How Instagram publishing works

The IG Graph API differs from Facebook's in two ways that shape the
design:

1. **No file uploads** — IG only accepts a public `image_url`. The app
   uploads photos as *unpublished* FB page photos and hands IG the fbcdn
   URL (resolved fresh at publish time, since fbcdn URLs carry expiring
   signatures — the queue stores the photo id, never the URL).
2. **No native scheduling** — publish = create container → poll →
   `media_publish`, and containers die after 24h. So scheduled IG posts
   sit in an Appwrite collection (`ig_queue`) until due, then get
   published by:
   - an in-process worker (starts with the app, checks every 60s), and
   - `GET /api/cron/ig` for serverless deploys (see `vercel.json`;
     protect with `CRON_SECRET`).

   ⚠️ If neither the app nor a cron is running at the scheduled time,
   the post publishes on next startup. Facebook posts are unaffected —
   Meta holds those natively. IG rate limit: ~25 API posts per account
   per 24h (a carousel counts as one).

### Media type mapping

| Composer input   | Facebook            | Instagram                          |
| ---------------- | ------------------- | ---------------------------------- |
| Text only        | Feed post           | — (IG requires media)              |
| Text + link      | Link post (preview  | — (IG has no link posts; URLs in   |
|                  | card; no media mix) | captions are plain text)           |
| 1 photo          | Photo feed post     | Image post                         |
| 2–10 photos      | Multi-photo post    | Carousel (child containers)        |
| 1 video          | Video post (native  | Reel via queue — video hosted in a |
|                  | schedule supported) | public Appwrite bucket (`ig_media`)|

IG Reels always run through the queue (even "publish now") because
Instagram's video processing takes minutes — the worker polls the
container and publishes when it's ready, usually within 1–3 minutes.
Reel specs: MP4/MOV, 3s–15min, 9:16 recommended.

### IG setup

1. Link an IG professional account to each Facebook Page (Meta Business
   Suite → Settings → Linked accounts).
2. Make sure the system-user token includes `instagram_basic` and
   `instagram_content_publish` permissions (regenerate if needed).
3. For **scheduled** IG posts, fill the `APPWRITE_*` vars in `.env`
   (immediate IG posting needs no queue) and run once:

   ```bash
   node scripts/setup-ig-db.mjs
   ```

## Setup (recommended: system user, never expires)

1. In [Business Manager](https://business.facebook.com) →
   **Business settings → Users → System users**, create a system user.
2. Add your Meta app to the business (**Accounts → Apps**).
3. Assign each page you want to manage to the system user as an asset,
   with content-publishing permission.
4. **Generate token** on the system user → select the app → check
   `pages_show_list`, `pages_manage_posts`, `pages_read_engagement` →
   expiry "never".
5. Configure and run:

```bash
cp .env.example .env      # FB_SYSTEM_USER_TOKEN, FB_PAGE_IDS (comma-
                          # separated), AUTH_SECRET, APP_PASSWORD
npm install
node scripts/diagnose.mjs # verifies every page before you start
npm run dev               # http://localhost:3000
```

To add a client's page later: assign it to the system user in Business
Manager, append its id to `FB_PAGE_IDS`, restart. Page tokens are
derived automatically via `GET /{page-id}?fields=access_token` (system
user pages don't reliably appear in `/me/accounts`).

A legacy single-page mode (`FB_PAGE_ID` + `FB_PAGE_ACCESS_TOKEN`) still
works when no system-user token is set.

Log in with `APP_PASSWORD`. The Compose page shows an "Active page" card
when credentials work; the sidebar switcher selects which page all views
operate on.

## Graph API endpoints used

| Action           | Call                                                        |
| ---------------- | ----------------------------------------------------------- |
| Page info        | `GET /{page-id}?fields=id,name,picture,fan_count`           |
| Text post        | `POST /{page-id}/feed` (`message`, opt. schedule params)    |
| Photo post       | `POST /{page-id}/photos` (multipart `source`)               |
| Schedule         | `published=false&scheduled_publish_time={unix}`             |
| List scheduled   | `GET /{page-id}/scheduled_posts`                            |
| List published   | `GET /{page-id}/published_posts` (+ engagement summaries)   |
| Reschedule       | `POST /{post-id}?scheduled_publish_time={unix}`             |
| Publish now      | `POST /{post-id}?is_published=true`                         |
| Delete scheduled | `DELETE /{post-id}`                                         |

Notes: scheduled time must be **10 minutes to 75 days** from the API
call. Instagram is not covered here — scheduling for IG uses a different
endpoint family (`/media` + `/media_publish`) and can be added later.

## Project layout

```
app/
  page.tsx            Compose (page card + composer)
  scheduled/page.tsx  Scheduled queue (reschedule / publish now / delete)
  published/page.tsx  Recent posts + engagement
  actions.ts          Server actions (create, cancel, reschedule, publish)
  login/              Shared-password login (same scheme as awaj-leads)
components/           Sidebar, MobileNav, Composer, RescheduleForm
lib/
  facebook.ts         Graph API client + scheduling-window validation
  auth.ts             Edge-safe cookie auth
  env.ts              Env accessors
middleware.ts         Route protection
```

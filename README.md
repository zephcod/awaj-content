# Awaj ET — Social Platform Manager

Multi-page Facebook post scheduler built on the Meta Graph API. Same
stack and auth pattern as `awaj-leads` (Next.js 15 App Router, Tailwind
4, shared-password login). Scheduling for all three platforms (Facebook,
Instagram, LinkedIn) is app-managed via Appwrite — see "How scheduling
works" below. (Facebook's own native scheduler was used originally, but
it silently throttles once a Page has ~30 pending scheduled posts with
no useful error, so new Facebook posts no longer use it — see
`lib/fbqueue.ts`.)

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
- **Scheduled** — app-managed Facebook, Instagram, and LinkedIn queues
  (plus any leftover legacy Facebook-native scheduled posts), with
  reschedule, publish-now/retry, and delete
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

## How Facebook scheduling works

Every scheduled Facebook post (text, link, photo(s), or video) is staged
in an Appwrite collection (`fb_queue`) as `pending`. Media is staged in
the same shared bucket used for IG Reel hosting (see `MEDIA_BUCKET` in
`lib/storage.ts` — one bucket, no separate Facebook bucket). At the
scheduled time, the same worker/cron pair that drives the IG and
LinkedIn queues re-uploads the media to Graph fresh and creates a real,
immediately-published post — `published=true`, no `scheduled_publish_time`
— so Facebook's native scheduler and its pending-post cap are never
involved:

- an in-process worker (starts with the app, checks every 60s), and
- `GET /api/cron/fb` for serverless deploys (same cron cadence as `/api/cron/ig`).

Immediate ("publish now") Facebook posts are unaffected — those still
call Graph directly, same as before.

### FB queue setup

Fill the `APPWRITE_*` vars in `.env` (immediate FB posting needs no
queue) and run once:

```bash
node scripts/setup-fb-db.mjs
```

This creates the `fb_queue` collection and verifies the shared media
bucket is reachable — no new bucket is created.

## How Instagram publishing works

The IG Graph API differs from Facebook's in two ways that shape the
design:

1. **No file uploads** — IG only accepts a public URL for any media
   (image, carousel photo, Reel video, Reel cover). All of it is staged
   in the shared Appwrite bucket (`MEDIA_BUCKET`, see `lib/storage.ts`)
   and served via its public `/view` URL — for both immediate posts and
   the queue. (An earlier version borrowed Facebook's own
   unpublished-page-photo mechanism instead; that was fragile — an
   unpublished photo not attached to a still-live post doesn't reliably
   survive a long wait, which is exactly what broke a scheduled IG post
   once. Dropped in favor of this.)
2. **No native scheduling** — publish = create container → poll →
   `media_publish`, and containers die after 24h. So scheduled IG posts
   sit in an Appwrite collection (`ig_queue`) until due, then get
   published by:
   - an in-process worker (starts with the app, checks every 60s), and
   - `GET /api/cron/ig` for serverless deploys, driven by a GitHub
     Actions schedule (`.github/workflows/ig-cron.yml`, every 5 min).
     Set repo secrets `APP_URL` + `CRON_SECRET` (must match the app's
     `CRON_SECRET` env). Note: GitHub schedules are best-effort — runs
     often land 3–15 min late, so treat IG publish times as "within
     ~15 minutes". On a PRIVATE repo a 5-min schedule (~9,000 billed
     minutes/month) exceeds the 2,000 free minutes — use a public
     repo, widen the interval (e.g. `*/15`), or an external pinger
     like cron-job.org. GitHub also auto-disables schedules in repos
     with no activity for 60 days — re-enable from the Actions tab.

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
| 1 video          | Video post           | Reel via queue — video (+ optional |
|                  | (queued if scheduled)| custom cover) hosted in `MEDIA_BUCKET` |

Reels support an optional custom cover image (Composer's "Reel cover"
field, Instagram-only, shown once a video is attached) — staged in the
same bucket and passed as the Graph API's `cover_url` param, which takes
precedence over Instagram's own auto-picked frame. Leave it blank and
Instagram behaves as before.

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

## LinkedIn (scaffold — not yet verified against a live app)

Posting/scheduling code exists for LinkedIn Company Pages
(`lib/linkedin.ts`, `lib/linkedinOAuth.ts`, `lib/linkedinOrgs.ts`,
`lib/liqueue.ts`), written against LinkedIn's documented Community
Management API shapes. It has **not been exercised against a real,
approved LinkedIn app** — treat every request/response shape as "best
effort from docs" until it has been.

### Why LinkedIn works differently from Facebook/Instagram here

- **No system user.** Every connected organization requires a human who
  is a super-admin of that org's LinkedIn Page to click through OAuth
  consent themselves, via `/api/linkedin/connect`. There's no way to
  add a client's Page centrally the way `FB_PAGE_IDS` works.
- **Access tokens expire every 60 days, with no refresh token** unless
  the app has been approved as a **Marketing Developer Platform (MDP)
  Partner** — a separate application process. Without that, someone has
  to manually reconnect each organization roughly every 2 months.
  `/settings/linkedin` flags connections within 7 days of expiry.
- **No native scheduling at all.** Every LinkedIn post publishes the
  moment the API is called — there's no "publish later" parameter.
  Scheduled posts (and all videos, since upload/processing status isn't
  polled here) sit in the app's own queue (`li_queue`, mirroring
  `ig_queue`) until due, published by the same in-process worker
  (`instrumentation.ts`) and `/api/cron/li` cron route used for
  Instagram.
- **App review is required before anything works.** LinkedIn's
  Community Management API needs a verified Page, a registered legal
  business entity, and a two-tier review (Development tier, then a
  separate Standard-tier request with a demo recording) before
  production posting is possible.

### Setup (once LinkedIn approval clears)

1. Create an app at the [LinkedIn Developer
   Portal](https://www.linkedin.com/developers/apps), verify it against
   Awaj ET's Company Page, and request the **Community Management API**
   product.
2. Add a redirect URL matching your deploy (e.g.
   `https://your-deploy.example.com/api/linkedin/callback`).
3. Fill `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`,
   `LINKEDIN_REDIRECT_URI` in `.env`.
4. Run once:
   ```bash
   node scripts/setup-li-db.mjs
   ```
   This creates the `li_connections` and `li_queue` Appwrite collections
   and a fresh media-staging bucket — paste the printed bucket id into
   `.env` as `LI_MEDIA_BUCKET_ID`.
5. Visit `/settings/linkedin` and send the "Connect a LinkedIn Page"
   link to each client's Page super-admin.
6. If not pursuing MDP Partner status, put a recurring reminder to check
   `/settings/linkedin` for expiring connections — Standard tier has no
   auto-refresh.

## Project layout

```
app/
  page.tsx                  Compose (page card + composer)
  scheduled/page.tsx        Scheduled queue (reschedule / publish now / delete)
  published/page.tsx        Recent posts + engagement
  settings/linkedin/        Connected LinkedIn orgs + connect/disconnect
  api/linkedin/connect/     Starts LinkedIn OAuth consent
  api/linkedin/callback/    Exchanges code for tokens, saves connection
  api/cron/fb/              Serverless-friendly Facebook queue publisher
  api/cron/ig/              Serverless-friendly Instagram queue publisher
  api/cron/li/              Serverless-friendly LinkedIn queue publisher
  actions.ts                Server actions (create, cancel, reschedule, publish)
  login/                    Shared-password login (same scheme as awaj-leads)
components/                 Sidebar, MobileNav, Composer, RescheduleForm
lib/
  facebook.ts         Graph API client + scheduling-window validation
  fbqueue.ts          Facebook scheduling queue (mirrors igqueue.ts)
  instagram.ts        IG Graph API client (containers, publish)
  igqueue.ts          Instagram scheduling queue
  linkedin.ts         LinkedIn posting/media client (SCAFFOLD — see above)
  linkedinOAuth.ts    LinkedIn OAuth2 (authorize URL, token exchange/refresh)
  linkedinOrgs.ts     Connected-organization store (Appwrite) + token refresh
  liqueue.ts          LinkedIn scheduling queue (mirrors igqueue.ts)
  storage.ts          Appwrite Storage: shared media bucket + LI staging bucket
  auth.ts             Edge-safe cookie auth
  env.ts              Env accessors
middleware.ts         Route protection
```

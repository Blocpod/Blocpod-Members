# Blocpod Operating Network

A working membership application for intelligence, reusable systems, community, demand discovery, and Blocpod engagements. Built with React, TypeScript, Hono, PostgreSQL, and Netlify Functions.

## Run locally

Requires Node.js 24 and pnpm 11.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://127.0.0.1:5173**. Choose **Member login → Member preview** or **Admin preview**. The development command migrates and seeds a persistent local PostgreSQL engine in `.data/postgres`; restarting preserves accounts, messages, saves, and edits. Seed operations never overwrite existing records.

The default local preview needs no external accounts. `pnpm dev` explicitly enables demonstration accounts when `DEMO_MODE` is not already set. To exercise real registration, copy `.env.example` to `.env`, use `DEMO_MODE=false`, and configure transactional email. Demo bypass endpoints are disabled whenever `NODE_ENV=production` or `NETLIFY=true`, even if `DEMO_MODE=true` was accidentally set.

Use the exact configured `APP_URL`, including host and port: cookie sessions and CSRF checks enforce the trusted origin. `localhost` and `127.0.0.1` are different origins. The provided default is `http://127.0.0.1:5173`.

## Included product journeys

- Public membership website, monthly/annual pricing, prerendered public pages, canonical metadata, structured data, sitemap, and robots directives. Public and account pricing refresh from authoritative plan records.
- Registration, login, logout, email verification, recovery, password-reset session revocation, onboarding, and editable member profiles.
- Goal routing with transparent lexical matches, personalized recommendations, tiered resources, category/search filters, Markdown articles, resource downloads, and saved systems.
- Personal projects combining saved resources, in-app notifications, and account/billing controls.
- Build Queue submissions, private business context, usage quotas, member votes, classifications, clusters, priority, assignment, status updates, duplicate merging, and resource resolution.
- Native community rooms, tier/private/organization access, persistent messages, replies, scoped mentions, reactions, reports, unread state, search, and cursor-paginated history. Messages update every five seconds while the page is visible. Transport is HTTP polling; the interface says so explicitly.
- Private Foundry inquiries and staff opportunity review. No AI-generated commercial commitments.
- Admin overview based on stored activity; member grants and suspensions; plan entitlements; editable Markdown publishing and previews; explicit human approval; scheduled publication; history snapshots; room allowlists; moderation; opportunities; automation; execution logs; and transactional email outbox status/retry.
- Durable queued editorial and triage jobs with atomic claims, execution leases, provider/model configuration, token usage, failure logs, review-only output, and authenticated background dispatch.

Every seeded article, conversation, and request is demonstration content. The sample agent and system resources are implementation guides, not silently deployed customer agents. Editing a published resource revokes approval unless an editor explicitly reapproves it. Resource Markdown supports headings, lists, images, links, code fences, and safe video embeds using `[Video title](https://www.youtube.com/watch?v=VIDEO_ID "embed")` or an HTTPS Vimeo video link with the same `"embed"` title. Other links remain normal links.

## Commands

| Command             | Purpose                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `pnpm dev`          | Local API + Vite + persistent demo database + local minute scheduler |
| `pnpm check`        | Strict TypeScript check                                              |
| `pnpm test`         | Security, billing, privacy, job and product integration tests        |
| `pnpm test:e2e`     | Browser journeys in a separate in-memory test database               |
| `pnpm build`        | Type check, production client build, public-page prerender           |
| `pnpm start`        | Serve the built application and API as a conventional Node server    |
| `pnpm db:migrate`   | Apply versioned SQL migrations                                       |
| `pnpm db:seed:core` | Install membership plans without example content                     |
| `pnpm db:seed`      | Install plans and clearly labeled example content                    |
| `pnpm admin:create` | Create the first administrator from shell-only credentials           |

For browser tests, install Chromium with `pnpm exec playwright install chromium`. Alternatively set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an existing Chrome/Chromium executable. Tests start their own server on ports 5174/3002; they do not modify the preview database. `pnpm test` uses isolated in-memory PostgreSQL databases.

## Configure production

The application is prepared for Netlify hosting. No production site, live payment account, email domain, or hosted database has been provisioned by this build.

1. Create a managed PostgreSQL database, preferably near your Netlify function region. Use the provider’s TLS connection URL and enable backups/PITR. Production deliberately refuses the local database fallback.
2. Add `DATABASE_URL` and an HTTPS `APP_URL` to the deployment environment. `APP_URL` is needed by both the build and Functions. Add provider secrets only to Functions; never use a `VITE_` prefix for a secret. Netlify’s automatic `URL` is used for worker dispatch when present, and the trusted `APP_URL` is used for account links and CSRF.
3. From a trusted shell with the target database variables set, run `pnpm db:migrate` and `pnpm db:seed:core`. Migrations are not run automatically during serverless requests. Use a separate database/branch for deploy previews.
4. Create the first admin with `ADMIN_EMAIL`, `ADMIN_NAME`, and `ADMIN_PASSWORD` (at least 16 characters) in the shell, then run `pnpm admin:create`. The command refuses to overwrite an existing account. Remove the password variable afterward. Subsequent role changes go through administration.
5. Configure email, Stripe, and AI as described below. Generate `JOBS_SECRET` from at least 32 random characters, for example `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
6. Import the repository in Netlify. `netlify.toml` sets the build command, publish directory, API routing, background worker, scheduled dispatch, security headers, and cache rules. Build with Node 24 and the pinned pnpm version. Set the Functions runtime to Node 24 as well if your Netlify account requires a separate runtime setting.
7. Deploy to a preview environment first. Verify `/api/health` reports a ready database, complete the provider checks below, then promote through your normal release process.

The same application can run on a conventional Node host with `pnpm build` and `pnpm start`, a production database, and a trusted origin. On that host, arrange an external scheduler for `runDueJobs()`; Netlify’s background dispatch is specific to Netlify. A Vercel-specific API adapter is not included.

### Stripe

Configure `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the six monthly/annual price IDs in `.env.example`. Start in Stripe test mode. Prices are validated against the plan’s stored USD amount and recurring interval before Checkout opens; mismatches fail closed. Admin plan price edits do not silently alter Stripe Prices—create/update the mapped provider prices as part of a pricing change.

Register **POST `/api/billing/webhook`** for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, and `invoice.payment_failed`. Configure the customer portal for allowed upgrades, downgrades, cancellation, and invoice history. Existing subscribers are routed to the portal instead of receiving a second subscription.

Webhook signatures are verified against the raw request. Event IDs deduplicate retries. The handler retrieves the current subscription state from Stripe, maps configured prices into membership plans, and updates authoritative membership state transactionally. Suspensions survive subsequent billing events. The checkout return URL never grants membership.

Before live keys: exercise successful checkout, failed payment, trial if enabled, upgrade, scheduled downgrade/cancellation, portal reactivation when supported, invoice retrieval, duplicate delivery, and out-of-order webhook delivery. Unit tests mock Stripe’s network boundary; actual Stripe-hosted flows have not been run here.

Billing logic lives in `server/billing.ts`; permission resolution lives in `server/auth.ts`. A Square adapter would write the same membership state and leave product gates unchanged; Square payment integration is not implemented.

### Transactional email

Set `RESEND_API_KEY` and `EMAIL_FROM` to a verified sending identity. Welcome, verification, and recovery messages are queued with persistent delivery status and provider idempotency keys. An unconfigured transport is visibly **blocked** in the admin outbox. Staff can inspect status and retry without seeing reset tokens or email bodies. The scheduler retries eligible failures; it never reports an undelivered email as sent.

Verify the full delivered-email → link → account flow on your real HTTPS origin. Configure sender authentication and your support/privacy contact before public release. Relevant-update preference is stored in the member profile; optional marketing digests are not sent by this implementation.

### AI and scheduled work

Set `AI_PROVIDER` to `openai` or `anthropic`, that provider’s API key, and an explicitly chosen supported model. Admin workflows can override provider/model. Member business context is kept out of automatic triage; only the public idea fields are submitted. Provider inputs are untrusted data, and generated articles remain unapproved review drafts.

Editorial generation currently synthesizes from the configured prompt. **It does not perform web research or invent citations.** Add a provenance-preserving research connector before enabling current-events publishing; maintain human review until its quality is established.

Netlify invokes `scheduled.ts` every 15 minutes on published deployments. That function only authenticates and dispatches `jobs-background.ts`; AI generation runs within the longer background limit. A batch stops starting work after ten minutes. Manual admin triggers return **202 queued** and preserve queued jobs even if immediate dispatch fails. Job logs expose actual completion or failure, never simulated success. Concurrent workers claim jobs atomically. Interrupted leases become visible failures.

Local `pnpm dev` checks scheduled work every minute. Manual local triggers also start the worker. The default seeded workflow is disabled. Automatic publication applies only to explicitly approved, scheduled content whose publication time has arrived.

## Security and operating notes

- HttpOnly, SameSite cookies; Secure cookies in hosted production; hashed random session tokens; salted scrypt passwords; single-use verification/recovery tokens; database-backed rate limiting; trusted-origin mutation checks; parameterized SQL; safe Markdown rendering; request-size limits.
- Entitlements resolve centrally from plan capabilities and explicit admin overrides. Clients cannot grant roles, plans, access, or successful payment state. Suspended accounts lose active sessions immediately. Inactive accounts keep access to their own request history, not other members’ demand data.
- Private rooms require explicit allowlist membership even for staff. Organization scopes apply to listing, history, reactions, search, and mentions. Projects, notifications, and private inquiry data are owner-scoped. Moderators cannot change billing, membership grants, or plan configuration.
- Audit records capture administrative mutations. Analytics count actual resource/search/message/request activity. Sensitive request bodies are not written to application logs. Health checks return service readiness without connection details.
- Fonts are self-hosted, with OFL licenses in `public/fonts`. No external font request is required. Reduced-motion preferences, keyboard navigation, focus states, labeled forms, native modal focus handling, and mobile navigation are implemented.
- Use separate databases and provider test keys for preview environments. Never connect a shareable preview to production private data.
- Back up PostgreSQL and test restoration before migration/release. Apply migrations once in a trusted release step; the migration table serializes concurrent attempts. Local `.data` is ignored by Git and must be copied separately if you want to preserve that local workspace.
- Configure hosting alerts for request errors, webhook failures, blocked email, and failed jobs. Review the admin failure log after releases. Production privacy/terms pages explicitly identify the need for final company details and policy review; replace those preview notices before accepting customers.

## Deliberate boundaries

The working product covers the core member and administrative journeys. WebSocket presence, binary uploads, direct messages, arbitrary member agent execution, research-source ingestion, organization seat billing, SSO, public API keys, referrals, and a marketplace are not exposed as pretend working controls. The schema already separates users, organizations, room memberships, product permissions, provider billing, and jobs so those capabilities can be added without replacing the core.

Search and recommendation matching are lexical, with explicit labeling. Chat and lists use bounded queries; message history has stable cursor pagination. A growing network will need indexed full-text/semantic retrieval, push transport, and pagination for the remaining admin catalogs before those catalogs exceed the current page limits.

## Platform references

- [Netlify Functions API](https://docs.netlify.com/build/functions/api/)
- [Netlify background functions](https://docs.netlify.com/build/functions/background-functions/)
- [Netlify function limits/configuration](https://docs.netlify.com/build/functions/configuration/)
- [Stripe subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks)
- [Hono documentation](https://hono.dev/docs/)
- [PGlite documentation](https://pglite.dev/docs/)

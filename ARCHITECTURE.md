# Application architecture

Blocpod is one TypeScript application: React/Vite, a Hono Web Request API, PostgreSQL, and Netlify Functions. Public pages are prerendered; authenticated data only comes through scoped API requests.

- **Identity:** `server/auth.ts` owns session/CSRF boundaries, verification, and permission resolution. Plans contain numeric and boolean capabilities; explicit admin overrides are applied centrally. Stripe state updates memberships, never client state.
- **Persistence:** `server/db.ts` uses hosted PostgreSQL in production and persistent PGlite for local work. Both use the same parameterized SQL and versioned migrations. Production cannot fall back to local storage. Run migrations in a trusted release step.
- **Product:** `server/features.ts` checks resource levels, room allowlists, organization boundaries, and owner scopes on every query. Private Build Queue context and inquiries never enter the public demand view. API routes return named JSON collections and snake_case record fields.
- **Billing:** `server/billing.ts` owns the Stripe adapter. Signature verification, event idempotency, current-state reconciliation, and price mapping are separate from product permissions. Additional billing providers would update the same membership records.
- **Automation:** `server/jobs.ts` atomically queues and claims work, records outcomes, handles interruption, and only generates review drafts. A scheduled Netlify function dispatches an authenticated background worker. Local development runs the same worker. Provider access lives in `server/ai.ts`; no member code is executed.
- **Communication:** Community messages are durable PostgreSQL records with stable history cursors and five-second visible-page polling. Replies, scoped mentions, reactions, reports, and unread state share the same authorization boundary. Native sockets/presence are a later transport decision.
- **Publishing:** Resources have tier metadata, approval, scheduling, version history, and Markdown content. Video embeds accept only approved YouTube/Vimeo hosts. React Markdown does not render arbitrary raw HTML.
- **Interface:** A responsive member shell connects goal routing, resources, projects, requests, community, billing, and private engagement inquiries. The admin area is lazy loaded and uses operational data rather than seeded chart counts.

Build and operating commands, provider setup, security controls, deliberately unimplemented future capabilities, and launch verification requirements are in `README.md`.

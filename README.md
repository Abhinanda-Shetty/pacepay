# PacePay

A freelance marketplace with milestone-based escrow-style payments, AI deliverable verification, and PayPal Sandbox checkout.

Clients post work, AI drafts the milestone plan, freelancers deliver evidence, AI verifies that evidence against the client's own requirements, the client approves, and only then can the client pay through PayPal. Money is never moved by the AI, by a button click, or by a browser request — only by a server-side flow that re-reads the order from PayPal and confirms the amount, currency and capture status first.

---

## What it actually does (the real flow)

1. **Sign up / sign in** — email + password, or Google. Each account picks one role: **client** or **freelancer**. (The **admin** role exists too, but it is granted manually in the database — a user cannot self-select it.)
2. **Client creates a project** — title, description, requirements, budget, currency, dates, category, skills, and an optional "post on the job board" switch.
3. **AI planning agent** drafts the milestone breakdown: names, amounts (summing to the budget), deliverables and risks. The client edits or accepts it.
4. **A freelancer gets attached**, one of two ways:
   - the client invites them by email, and they accept the invite from their Projects page, or
   - the project is on the public **job board**, a freelancer applies, and the client hires one applicant.
5. **Freelancer works and submits** each milestone with real evidence: uploaded files (PDF, DOCX, images, ZIP of source), a website URL, or a public GitHub repository URL.
6. **AI deliverable verification** downloads and inspects that evidence on the server and produces a **requirement-wise report**: every client requirement is marked *Verified*, *Partially verified*, *Not verified* or *Unable to verify*, with the evidence it used, what is missing, and improvement suggestions.
7. **The client decides** — approve the milestone or request a revision. A revision request sends the freelancer back to step 5; every submission and every re-inspection is kept as history.
8. **Payment** — once a milestone is `approved`, the client can pay it. A PayPal Sandbox order is created for exactly the approved milestone amount, the buyer approves it in PayPal's own window, and the server captures it.
9. **Status is set from PayPal's answer, not from the click** — the milestone becomes `paid` only after the server re-reads the order and capture from PayPal and confirms `amount + currency + capture status`.
10. **After the whole project is completed**, both sides can leave a rating and review.
11. **If something goes wrong**, either side can raise a **dispute**; an **admin** resolves it and can issue a **full or partial refund** against the stored capture ID.

---

## Pages

| Route | What is on it |
| --- | --- |
| `/` | Landing page. The PacePay logo (on every page) links back here. |
| `/auth` | Sign up, sign in, Google sign in, role choice. |
| `/dashboard` | Role-aware summary: for freelancers, **Earned** (PayPal-confirmed money, net of refunds) plus a completed-project timeline; for clients, active budget and their projects. Counts only projects that belong to you — other people's job-board posts are never counted. |
| `/projects` | Your projects, plus pending invites matched to your exact email. |
| `/projects/new` | Create a project; AI milestone planning; job-board option. |
| `/projects/:id` | Milestones, submissions, applications (hire/decline), disputes, ratings, job-board switch. |
| `/milestones/:id` | Submit evidence, read the AI verification report, re-inspect, approve or request revision, pay, refund, "Check with PayPal". |
| `/jobs` | Public job board: search, category, budget range, sort, apply, withdraw. |
| `/payments` | Payment attempts and their statuses. |
| `/analytics` | AG Grid financial table + summary cards, scoped to your role, with CSV export. |
| `/ai` | AI workflow center: what each agent does, pending reviews, overdue reminders. |
| `/notifications` | Invites, submissions, approvals, payments, disputes, refunds. |
| `/settings` | Profile, role, sign out. |
| `/admin` | Dispute queue — **admins only**: resolve with a full or partial refund. |
| `POST /api/public/paypal/webhook` | PayPal webhook receiver (signature-verified, idempotent). |

---

## AI deliverable verification

`src/lib/deliverables.server.ts` inspects the actual artifact instead of trusting a filename or a description.

| Evidence | How it is inspected |
| --- | --- |
| PDF | Sent to the model as a real document (content and layout). |
| DOCX | Unzipped, `word/document.xml` text extracted. |
| Images / screenshots | Passed as pixels for visual inspection. |
| ZIP / source archive | Extracted; source, README and config files read; `node_modules`, `dist`, `build`, `.git`, `vendor`, `coverage` skipped. |
| Plain text / code files | Read directly. |
| Website URL | Fetched server-side, HTML reduced to headings/buttons and text. |
| Public GitHub repo | Default-branch archive fetched through the public API, source files read. |

Hard limits and guardrails: at most 8 files and 5 links per review; 20 MB per file, 10 MB per image/PDF, 15 MB per repository archive, 180,000 characters of extracted text; archive extraction is bounded against zip bombs (entry count, declared size, per-entry size); website URLs are checked for private/local addresses and DNS-resolved before fetching, with a redirect cap and content-type check; all evidence is treated as untrusted data, never as instructions.

`src/lib/ai.server.ts` runs one streamed, strict-structured-output call through the Lovable AI Gateway and stores the result in `ai_reviews`. **AI output is advisory only**: it cannot approve a milestone, cannot mark anything paid, and cannot start a payment. Approval runs only through the `decide_milestone` database function, called by the project's client.

---

## Payments (PayPal Sandbox)

- Order and capture IDs are stored separately; the amount always comes from the approved milestone row, never from the browser.
- Unique indexes allow **one active attempt** and **one captured payment per milestone**; repeated clicks reuse the active order instead of creating a second one.
- Capture is claimed atomically and sent with a `PayPal-Request-Id`, so a capture happens at most once; `ORDER_ALREADY_CAPTURED` and `INSTRUMENT_DECLINED` are handled as buyer-retry cases.
- A payment is marked `paid` only after the server re-reads the order and capture from PayPal (`src/lib/payments.server.ts` + pure rules in `src/lib/payment-rules.ts`). A confirmed capture is never downgraded.
- `created` / `pending` / `failed` / `cancelled` / `refunded` / `partially_refunded` are all first-class states; the milestone stays unpaid in every non-confirmed case.
- Refunds are issued server-side against the stored capture ID by an admin resolving a dispute.
- PayPal secrets live only on the server (`src/lib/paypal.server.ts`, through the connector gateway); the browser only ever sees the public client ID used to render the button.
- PayPal's own compliance declines ("Transaction declined … international regulations") are surfaced as a clear message: no money moved, milestone unpaid, try another PayPal account or contact PayPal. The app cannot and does not bypass them.

---

## Analytics

`/analytics` is a normal page inside this app (AG Grid Community, `ag-grid-react`) reading your own database — no external dashboard.

- Summary cards: settled money (net of refunds), refunded, waiting on PayPal, failed/cancelled — grouped **per currency**, so USD and EUR are never added together.
- Role scoping: freelancers see money they were paid, clients see money they paid, admins see platform-wide.
- Every figure comes from `src/lib/analytics.ts`, which only counts PayPal-confirmed payments — the grid cannot show unconfirmed money.
- Empty and error states say so instead of showing zeroes; CSV export exports exactly the rows currently in the grid.

---

## Architecture map

| File | Responsibility |
| --- | --- |
| `src/lib/pacepay.functions.ts` | Server functions: `planProject`, `reviewSubmission`, `createPayPalOrder`, `capturePayPalOrder`, `cancelPayPalOrder`, `reconcilePayment`, `resolveDispute`, `sendReminders`. Privileged writes run with the service client **after** an RLS-scoped authorization check. |
| `src/lib/payments.server.ts` | `syncPayment` — the only way payment status changes. |
| `src/lib/payment-rules.ts` | Pure PayPal→app status rules (unit tested). |
| `src/lib/paypal.server.ts` | Connector-gateway HTTP client, error logging (name, issue, description, debug id). |
| `src/lib/deliverables.server.ts` | Evidence inspection and its bounds. |
| `src/lib/ai.server.ts` | Structured AI calls through the Lovable AI Gateway. |
| `src/lib/analytics.ts` | Money totals, per currency. |
| `src/lib/project-access.ts` | Which projects are yours vs. a pending invite vs. someone else's job-board post. |
| `src/lib/project-access.ts` + DB triggers | Guardrails below. |
| `src/routes/api/public/paypal/webhook.ts` | Signature-verified webhook reconciliation. |
| `src/components/AIReview.tsx` | Requirement-wise report UI. |
| `drizzle/migrations/*.sql` | Schema, grants, RLS policies, functions, triggers. |

### Database guardrails (enforced in Postgres, not in the UI)

- New milestones must be inserted as `pending`.
- `guard_project_freelancer`: a project's assigned freelancer/client cannot be swapped after assignment; assignment only happens through `join_project` (invite) or `accept_application`.
- Projects with payments cannot be deleted.
- `profiles` are visible only to yourself and your project collaborators.
- `ai_reviews`, `payments`, paid status and system notifications are read-only for signed-in users; only server functions write them.
- Milestone approval/revision runs only through `decide_milestone`; a freelancer cannot approve their own submission.
- A project cannot be completed while a milestone is unpaid and undisputed-refunded.
- One open dispute per milestone; only admins resolve; ratings only after completion, one per project per reviewer.

---

## Tech stack

TanStack Start v1 (React 19, SSR + server functions), TanStack Router + Query, Tailwind CSS v4, shadcn/ui + Radix, AG Grid Community, Supabase (Postgres, auth, RLS, service client), PayPal through Lovable's connector gateway, AI through the Lovable AI Gateway, Vitest + Testing Library, Vite + Nitro (Cloudflare build target).

---

## Setup

### Run it from Lovable (no setup)

Open the project in the [Lovable editor](https://lovable.dev/projects/d409c0f8-b485-4ed4-aa96-caa6351ffef8) and describe what you want. The backend, secrets, AI gateway and PayPal connection are already wired.

### Run it locally from this repository

**Prerequisites:** Node 20+ and Bun (or npm), plus a Postgres/Supabase project for the data.

```sh
git clone <this-repository-url>
cd PacePay
bun install          # or: npm install
cp .env.example .env # fill in the values below
bun run dev          # or: npm run dev
```

Open http://localhost:8080.

**Browser config (`.env`, `VITE_` prefix — safe to commit as placeholders):**

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Backend URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable (anon) key |
| `VITE_SUPABASE_PROJECT_ID` | Backend project id |
| `VITE_LOVABLE_CONNECTOR_PAYPAL_CLIENT_ID` | PayPal client ID used to render the checkout button |

**Server-only secrets (never in the repo, never in `VITE_`):**

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID` | Server-side backend access |
| Service-role key | Used by the generated service client for privileged writes inside server functions |
| `LOVABLE_API_KEY` | Lovable AI Gateway + connector gateway (AI and PayPal calls) |
| `PAYPAL_API_KEY` | PayPal credentials for the connector |
| `PAYPAL_WEBHOOK_ID` | Enables webhook signature verification and automatic reconciliation |

In Lovable these live in **Secrets**; running locally, put them in your own environment and keep them out of git.

**Apply the schema** to your database before signing up: the migration files in `drizzle/migrations/` (0000 core → 0004 AI verification) contain tables, grants, RLS policies, functions and triggers. In Lovable they are already applied; locally, apply them in order with your usual SQL client or `drizzle-kit`.

**AI:** `src/lib/ai.server.ts` calls the Lovable AI Gateway and needs `LOVABLE_API_KEY`. Without it, planning and verification raise "AI is not configured" — point that file at your own provider key if you are running fully offline from Lovable.

**PayPal:** use **Sandbox only**. Create a sandbox app and a sandbox buyer, set the client ID and the server credentials, and add the webhook URL `https://<your-host>/api/public/paypal/webhook` in the PayPal dashboard to enable automatic status updates. Without `PAYPAL_WEBHOOK_ID` the webhook endpoint returns 501 and you reconcile manually with the **Check with PayPal** button on the milestone page.

### Scripts

| Command | Does |
| --- | --- |
| `bun run dev` | Dev server |
| `bun run build` / `bun run preview` | Production build / local preview of the build |
| `bun run test` | Vitest — 23 checks across 5 files |
| `bun run lint` / `bun run format` | ESLint / Prettier |

### Tests

`src/test/` — `payment-rules.test.ts` (10: PayPal→app status mapping, refund amounts, no downgrade of a confirmed capture), `deliverables.test.ts` (4: DOCX text, ZIP source with `node_modules` excluded, fake PDF rejected, private URL blocked), `analytics.test.ts` (4: per-currency totals, refunds netted, unconfirmed money excluded, role scoping), `project-access.test.ts` (4: own project vs. pending invite vs. job-board post), `app-routing.test.tsx` (1: route tree integrity).

---

## Security model, in one screen

- Amount comes from the approved milestone row; the browser cannot set it.
- Approval authority is the client's, enforced by `decide_milestone`; AI is advisory.
- One active attempt and one capture per milestone, enforced by unique indexes plus an atomic capture claim and `PayPal-Request-Id`.
- Payment state comes from PayPal, re-read server-side, never from a client assertion.
- PayPal secrets and the service-role key stay server-side; the browser sees only the public client ID.
- RLS on every table; privileged tables are read-only for users.
- Evidence downloads are bounded and SSRF-checked; archive extraction is bounded; evidence is data, never instructions.
- Compliance declines are reported, not worked around.

---

## Known gaps

- **Admin account:** the `admin` role exists and `/admin` is wired, but no account has been granted it — it must be set in the database (say which email).
- **Webhook:** `PAYPAL_WEBHOOK_ID` is not configured, so PayPal does not push status updates automatically; the milestone page's **Check with PayPal** button reconciles on demand.
- **Sandbox buyer accounts** can be restricted by PayPal itself (compliance declines); that is a PayPal account state, not an app bug.
- **Local AI:** running outside Lovable needs your own provider key in `src/lib/ai.server.ts`.

---

## Repo conventions

- Do not edit generated files (`src/integrations/supabase/*`, `src/routeTree.gen.ts`, `.env`) or hand-edit `drizzle/migrations/` — schema changes go through Lovable.
- Keep `LOVABLE_API_KEY` and all secret values out of the repository and out of browser code.
- Keep the connected branch in a working state: pushes to it sync back into the editor.

Built with [Lovable](https://lovable.dev).

<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## PacePay architecture
- Privileged writes (ai_reviews, payments, paid status, system notifications) go through server functions in src/lib/pacepay.functions.ts using the admin client after an RLS-scoped authorization check; authenticated users have read-only grants on those tables so the browser can't forge them.
- Milestone approval/revision runs only through the `decide_milestone` DB function; freelancers join via `join_project` (invite matched by email).
- PayPal calls go through the connector gateway (src/lib/paypal.server.ts); payment amount always comes from the approved milestone row, never the client.
- AI agents use src/lib/ai.server.ts (streamed Responses call with strict structured output); AI is advisory and never changes approval or payment state.
- DB guards: new milestones must be inserted as `pending`, a project's assigned freelancer/client can't be changed after assignment (trigger `guard_project_freelancer`), projects with payments can't be deleted, and profiles are visible only to self and project collaborators — keeps the approve→pay flow and payee un-bypassable.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ---------- Agent 1: Project planning ---------- */
const planSchema = z.object({
  milestones: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      requirements: z.string(),
      deliverables: z.string(),
      amount: z.number(),
      deadline: z.string().nullable(),
    }),
  ),
  risks: z.array(z.string()),
});
export type AIPlan = z.infer<typeof planSchema>;

export const planProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().min(1).max(200),
        description: z.string().max(5000),
        requirements: z.string().max(5000),
        budget: z.number().min(0),
        currency: z.string().max(5),
        deadline: z.string().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { runStructured } = await import("./ai.server");
    const today = new Date().toISOString().slice(0, 10);
    const plan = await runStructured(
      planSchema,
      "You are PacePay's project planning agent. Split freelance projects into 3-6 sequential, verifiable milestones. Each milestone needs concrete, checkable requirements and deliverables (one per line). Amounts must sum exactly to the budget. Deadlines are ISO dates (YYYY-MM-DD) between today and the project deadline, or null if no deadline. List 2-5 concrete delivery risks.",
      `Today: ${today}\nTitle: ${data.title}\nDescription: ${data.description}\nRequirements: ${data.requirements}\nBudget: ${data.budget} ${data.currency}\nDeadline: ${data.deadline ?? "none"}`,
    );
    // normalize amounts so they sum to budget
    const sum = plan.milestones.reduce((s, m) => s + Math.max(0, m.amount), 0) || 1;
    let acc = 0;
    plan.milestones = plan.milestones.slice(0, 8).map((m, i, arr) => {
      const amt = i === arr.length - 1 ? +(data.budget - acc).toFixed(2) : +((Math.max(0, m.amount) / sum) * data.budget).toFixed(2);
      acc += amt;
      return { ...m, amount: amt };
    });
    return plan;
  });

/* ---------- Agent 2: Work verification ---------- */
const reviewSchema = z.object({
  summary: z.string(),
  requirementsChecked: z.array(z.string()),
  requirementsSatisfied: z.array(z.string()),
  missingRequirements: z.array(z.string()),
  issues: z.array(z.string()),
  recommendation: z.enum(["APPROVE", "REVISION_REQUIRED", "MANUAL_REVIEW"]),
  confidence: z.number(),
});

export const reviewSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ submissionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // RLS: caller must be a project member to read this
    const { data: sub, error } = await context.supabase
      .from("submissions")
      .select("*, milestones(title, requirements, deliverables, description)")
      .eq("id", data.submissionId)
      .single();
    if (error || !sub) throw new Error("Submission not found");
    const m = sub.milestones as any;
    const { runStructured, AI_MODEL } = await import("./ai.server");
    const r = await runStructured(
      reviewSchema,
      "You are PacePay's work verification agent. Evaluate the freelancer's submission strictly against the milestone requirements and deliverables. You cannot open files or links; you only see their names/URLs and the freelancer's description. Never assume work is correct because something was uploaded. If evidence is insufficient to verify a requirement, list it as missing and prefer MANUAL_REVIEW. Use APPROVE only when every requirement is clearly evidenced. Confidence is 0.0-1.0. You never approve payment — the client decides.",
      `Milestone: ${m.title}\nDescription: ${m.description}\nRequirements:\n${m.requirements}\nDeliverables:\n${m.deliverables}\n\nSubmission (v${sub.version}):\n${sub.description}\nEvidence links: ${sub.evidence_urls.join(", ") || "none"}\nUploaded files: ${sub.evidence_files.map((f: string) => f.split("/").pop()).join(", ") || "none"}`,
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error: insErr } = await supabaseAdmin
      .from("ai_reviews")
      .insert({
        submission_id: sub.id,
        project_id: sub.project_id,
        summary: r.summary,
        requirements_checked: r.requirementsChecked,
        requirements_satisfied: r.requirementsSatisfied,
        missing_requirements: r.missingRequirements,
        issues: r.issues,
        recommendation: r.recommendation,
        confidence: Math.min(1, Math.max(0, r.confidence)),
        model: AI_MODEL,
      })
      .select()
      .single();
    if (insErr) throw new Error(insErr.message);
    return row;
  });

/* ---------- Agent 4: Payment coordination (PayPal Sandbox) ---------- */
async function loadPayable(context: any, milestoneId: string) {
  const { data: ms } = await context.supabase
    .from("milestones")
    .select("*, projects(id, client_id, freelancer_id)")
    .eq("id", milestoneId)
    .single();
  if (!ms) throw new Error("Milestone not found");
  const p = ms.projects as any;
  if (p.client_id !== context.userId) throw new Error("Only the project client can pay this milestone");
  if (!p.freelancer_id) throw new Error("No freelancer assigned to receive payment");
  if (Number(ms.amount) <= 0) throw new Error("Milestone amount must be greater than zero");
  return { ms, p };
}

const ACTIVE = ["created", "approved", "pending"] as const;

export const createPayPalOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ milestoneId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { ms, p } = await loadPayable(context, data.milestoneId);
    if (ms.status !== "approved") throw new Error("Milestone must be approved before payment");
    const { data: openDispute } = await context.supabase.from("disputes").select("id").eq("milestone_id", ms.id).eq("status", "open").maybeSingle();
    if (openDispute) throw new Error("This milestone has an open dispute. Payment is paused until an admin resolves it.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { paypal } = await import("./paypal.server");
    const { syncPayment } = await import("./payments.server");

    // Reuse the current unfinished attempt (repeated clicks/requests) instead of creating duplicates
    const { data: active } = await supabaseAdmin.from("payments").select("*").eq("milestone_id", ms.id).in("status", ACTIVE).maybeSingle();
    if (active) {
      if (!active.paypal_order_id) {
        if (Date.now() - new Date(active.created_at).getTime() < 60_000) throw new Error("A payment is already being prepared. Try again in a moment.");
        await supabaseAdmin.from("payments").update({ status: "failed", status_detail: "Order creation did not finish", updated_at: new Date().toISOString() }).eq("id", active.id);
      } else {
        const synced = await syncPayment(active);
        if (synced.status === "created" || synced.status === "approved") return { orderId: synced.paypal_order_id as string, reused: true };
        if (synced.status === "pending") throw new Error("A payment for this milestone is pending at PayPal. Use “Check with PayPal” for updates.");
        if (synced.status === "completed") throw new Error("This milestone is already paid.");
      }
    }

    // Claim the single active-attempt slot first (unique index blocks concurrent duplicates)
    const { data: claim, error: claimErr } = await supabaseAdmin
      .from("payments")
      .insert({ project_id: p.id, milestone_id: ms.id, payer_id: context.userId, payee_id: p.freelancer_id, amount: ms.amount, currency: ms.currency, status: "created", status_detail: "Creating PayPal order" })
      .select()
      .single();
    if (claimErr || !claim) throw new Error("A payment attempt is already in progress for this milestone.");

    try {
      const order = await paypal<{ id: string; status: string }>("/v2/checkout/orders", {
        method: "POST",
        headers: { "PayPal-Request-Id": `order-${claim.id}` },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{
            reference_id: ms.id,
            custom_id: claim.id,
            description: `PacePay milestone: ${ms.title}`.slice(0, 127),
            amount: { currency_code: ms.currency, value: Number(ms.amount).toFixed(2) },
          }],
        }),
      });
      await supabaseAdmin.from("payments").update({ paypal_order_id: order.id, status_detail: "Waiting for buyer approval", updated_at: new Date().toISOString() }).eq("id", claim.id);
      return { orderId: order.id, reused: false };
    } catch (e: any) {
      await supabaseAdmin.from("payments").update({ status: "failed", status_detail: `Order creation failed: ${String(e?.message).slice(0, 200)}`, updated_at: new Date().toISOString() }).eq("id", claim.id);
      throw new Error("PayPal could not create the order. Please try again.");
    }
  });

export const capturePayPalOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ milestoneId: z.string().uuid(), orderId: z.string().min(5).max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    const { ms } = await loadPayable(context, data.milestoneId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pay } = await supabaseAdmin
      .from("payments").select("*")
      .eq("paypal_order_id", data.orderId).eq("milestone_id", ms.id).eq("payer_id", context.userId)
      .single();
    if (!pay) throw new Error("Unknown payment order");
    if (["completed", "partially_refunded", "refunded"].includes(pay.status)) return { status: pay.status, captureId: pay.paypal_capture_id };
    if (!["created", "approved"].includes(pay.status)) throw new Error(`This payment attempt is ${pay.status}. Start a new payment.`);
    if (ms.status !== "approved") throw new Error("Milestone must be approved before payment");

    // Atomic claim: only one request may capture (stale claims expire after 2 minutes)
    const staleBefore = new Date(Date.now() - 120_000).toISOString();
    const { data: claimed } = await supabaseAdmin
      .from("payments")
      .update({ capture_claimed_at: new Date().toISOString(), status_detail: "Capturing", updated_at: new Date().toISOString() })
      .eq("id", pay.id).in("status", ["created", "approved"])
      .or(`capture_claimed_at.is.null,capture_claimed_at.lt.${staleBefore}`)
      .select();
    if (!claimed?.length) return { status: "processing", captureId: null };

    const { paypal, PayPalError } = await import("./paypal.server");
    const { syncPayment } = await import("./payments.server");
    try {
      await paypal(`/v2/checkout/orders/${data.orderId}/capture`, { method: "POST", headers: { "PayPal-Request-Id": `capture-${pay.id}` } });
    } catch (e) {
      const issues = e instanceof PayPalError ? e.issues : [];
      if (!issues.includes("ORDER_ALREADY_CAPTURED")) {
        const retryable = issues.includes("INSTRUMENT_DECLINED");
        await supabaseAdmin.from("payments").update({
          status: retryable ? "created" : "failed",
          capture_claimed_at: null,
          status_detail: `Capture rejected: ${issues.join(", ") || "PayPal error"}`,
          updated_at: new Date().toISOString(),
        }).eq("id", pay.id);
        throw new Error(retryable ? "PayPal declined that payment method. Choose another and try again." : `PayPal rejected the capture (${issues.join(", ") || "error"}).`);
      }
    }
    // Always confirm from PayPal's own record of the order before changing status
    const synced = await syncPayment(pay);
    return { status: synced.status as string, captureId: synced.paypal_capture_id as string | null };
  });

export const cancelPayPalOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ milestoneId: z.string().uuid(), orderId: z.string().min(5).max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    await loadPayable(context, data.milestoneId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pay } = await supabaseAdmin.from("payments").select("*").eq("paypal_order_id", data.orderId).eq("payer_id", context.userId).maybeSingle();
    if (!pay || pay.status !== "created" || pay.capture_claimed_at) return { status: pay?.status ?? "unknown" };
    const { syncPayment } = await import("./payments.server");
    const synced = await syncPayment(pay);
    if (synced.status === "created") {
      await supabaseAdmin.from("payments").update({ status: "cancelled", status_detail: "Buyer cancelled at PayPal", updated_at: new Date().toISOString() }).eq("id", pay.id).eq("status", "created");
      return { status: "cancelled" };
    }
    return { status: synced.status };
  });

export const reconcilePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ paymentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // RLS: caller must be a project member or admin to see this payment
    const { data: visible } = await context.supabase.from("payments").select("id").eq("id", data.paymentId).maybeSingle();
    if (!visible) throw new Error("Payment not found");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pay } = await supabaseAdmin.from("payments").select("*").eq("id", data.paymentId).single();
    const { syncPayment } = await import("./payments.server");
    const synced = await syncPayment(pay);
    return { status: synced.status as string };
  });

/* ---------- Disputes & refunds (admin decides) ---------- */
const PAID_OUTCOMES = ["no_refund", "partial_refund", "full_refund"] as const;
const UNPAID_OUTCOMES = ["no_change", "revision_required", "approve"] as const;

export const resolveDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      disputeId: z.string().uuid(),
      outcome: z.enum([...PAID_OUTCOMES, ...UNPAID_OUTCOMES]),
      refundAmount: z.number().positive().max(1_000_000).nullable(),
      notes: z.string().min(5).max(3000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin");
    if (!isAdmin) throw new Error("Only a PacePay admin can resolve disputes");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: d } = await supabaseAdmin.from("disputes").select("*, milestones(*), projects(client_id, freelancer_id, title)").eq("id", data.disputeId).single();
    if (!d) throw new Error("Dispute not found");
    if (d.status !== "open") throw new Error("Dispute is already resolved");
    const m = d.milestones as any;
    const proj = d.projects as any;
    const isPaid = m.status === "paid";
    if (isPaid !== (PAID_OUTCOMES as readonly string[]).includes(data.outcome))
      throw new Error(isPaid ? "Paid milestones are resolved with a refund decision" : "Unpaid milestones can't be refunded");

    let refundAmount: number | null = null;
    const now = new Date().toISOString();
    if (data.outcome === "full_refund" || data.outcome === "partial_refund") {
      const { refundAmountFor } = await import("./payment-rules");
      const { data: pay } = await supabaseAdmin.from("payments").select("*").eq("milestone_id", m.id).in("status", ["completed", "partially_refunded"]).maybeSingle();
      if (!pay?.paypal_capture_id) throw new Error("No captured PayPal payment found for this milestone");
      refundAmount = refundAmountFor(data.outcome, Number(pay.amount), Number(pay.refunded_amount), data.refundAmount);
      const { data: rf, error: rfErr } = await supabaseAdmin.from("refunds")
        .insert({ project_id: d.project_id, payment_id: pay.id, dispute_id: d.id, amount: refundAmount, currency: pay.currency, status: "requested" })
        .select().single();
      if (rfErr || !rf) throw new Error("Could not record refund");
      const { paypal } = await import("./paypal.server");
      let res: any;
      try {
        res = await paypal(`/v2/payments/captures/${pay.paypal_capture_id}/refund`, {
          method: "POST",
          headers: { "PayPal-Request-Id": `refund-${rf.id}` },
          body: JSON.stringify({ amount: { value: refundAmount.toFixed(2), currency_code: pay.currency }, note_to_payer: `PacePay dispute resolution: ${m.title}`.slice(0, 255) }),
        });
      } catch (e: any) {
        await supabaseAdmin.from("refunds").update({ status: "FAILED", raw: { error: String(e?.message).slice(0, 500) } }).eq("id", rf.id);
        throw new Error("PayPal rejected the refund. The dispute is still open.");
      }
      await supabaseAdmin.from("refunds").update({ paypal_refund_id: res.id, status: res.status, raw: res }).eq("id", rf.id);
      if (res.status !== "COMPLETED" && res.status !== "PENDING") throw new Error(`PayPal refund status: ${res.status}. The dispute is still open.`);
      const { syncPayment } = await import("./payments.server");
      await syncPayment(pay);
    } else if (data.outcome === "revision_required") {
      await supabaseAdmin.from("milestones").update({ status: "revision_requested", updated_at: now }).eq("id", m.id).in("status", ["submitted", "approved"]);
    } else if (data.outcome === "approve") {
      await supabaseAdmin.from("milestones").update({ status: "approved", updated_at: now }).eq("id", m.id).in("status", ["submitted", "revision_requested"]);
    }

    await supabaseAdmin.from("disputes").update({
      status: "resolved", outcome: data.outcome, refund_amount: refundAmount, resolution_notes: data.notes, resolved_by: context.userId, resolved_at: now,
    }).eq("id", d.id);
    const label = data.outcome.replace(/_/g, " ");
    const notes = [proj.client_id, proj.freelancer_id].filter(Boolean).map((uid: string) => ({
      user_id: uid, type: "dispute", title: `Dispute resolved: ${m.title}`,
      message: `Decision: ${label}${refundAmount ? ` (${m.currency} ${refundAmount.toFixed(2)})` : ""}. ${data.notes}`.slice(0, 500),
      link: `/milestones/${m.id}`,
    }));
    if (notes.length) await supabaseAdmin.from("notifications").insert(notes);
    return { ok: true, refundAmount };
  });

/* ---------- Agent 3: Approval & reminders ---------- */
export const sendReminders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: ms } = await context.supabase
      .from("milestones")
      .select("id, title, status, deadline, projects!inner(title, client_id, freelancer_id)")
      .in("status", ["pending", "in_progress", "submitted", "revision_requested"]);
    const today = new Date().toISOString().slice(0, 10);
    const notes: { user_id: string; type: string; title: string; message: string; link: string }[] = [];
    for (const m of ms ?? []) {
      const p = m.projects as any;
      if (m.status === "submitted" && p.client_id === context.userId)
        notes.push({ user_id: p.client_id, type: "reminder", title: `Review pending: ${m.title}`, message: `A submission on ${p.title} is waiting for your decision.`, link: `/milestones/${m.id}` });
      if (m.deadline && m.deadline < today && m.status !== "submitted") {
        for (const uid of [p.client_id, p.freelancer_id].filter(Boolean))
          if (uid === context.userId)
            notes.push({ user_id: uid, type: "overdue", title: `Overdue: ${m.title}`, message: `Deadline ${m.deadline} on ${p.title} has passed.`, link: `/milestones/${m.id}` });
      }
    }
    if (notes.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("notifications").insert(notes);
    }
    return { created: notes.length };
  });

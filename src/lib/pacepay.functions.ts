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

/* ---------- Agent 4: Payment coordination (PayPal) ---------- */
async function loadPayable(context: any, milestoneId: string) {
  const { data: ms } = await context.supabase
    .from("milestones")
    .select("*, projects(id, client_id, freelancer_id)")
    .eq("id", milestoneId)
    .single();
  if (!ms) throw new Error("Milestone not found");
  const p = ms.projects as any;
  if (p.client_id !== context.userId) throw new Error("Only the project client can pay this milestone");
  if (ms.status !== "approved") throw new Error("Milestone must be approved before payment");
  if (!p.freelancer_id) throw new Error("No freelancer assigned to receive payment");
  if (Number(ms.amount) <= 0) throw new Error("Milestone amount must be greater than zero");
  return { ms, p };
}

export const createPayPalOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ milestoneId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { ms, p } = await loadPayable(context, data.milestoneId);
    const { paypal } = await import("./paypal.server");
    const order = await paypal<{ id: string; status: string }>("/v2/checkout/orders", {
      method: "POST",
      headers: { "PayPal-Request-Id": `pp-create-${ms.id}-${Date.now()}` },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: ms.id,
            description: `PacePay milestone: ${ms.title}`.slice(0, 127),
            amount: { currency_code: ms.currency, value: Number(ms.amount).toFixed(2) },
          },
        ],
      }),
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("payments").insert({
      project_id: p.id,
      milestone_id: ms.id,
      payer_id: context.userId,
      payee_id: p.freelancer_id,
      amount: ms.amount,
      currency: ms.currency,
      paypal_order_id: order.id,
      status: "created",
    });
    return { orderId: order.id };
  });

export const capturePayPalOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ milestoneId: z.string().uuid(), orderId: z.string().min(5).max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    const { ms } = await loadPayable(context, data.milestoneId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pay } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("paypal_order_id", data.orderId)
      .eq("milestone_id", ms.id)
      .eq("payer_id", context.userId)
      .single();
    if (!pay) throw new Error("Unknown payment order");
    if (pay.status === "completed") return { status: "completed", captureId: pay.paypal_capture_id };
    const { paypal } = await import("./paypal.server");
    let result: any;
    try {
      result = await paypal(`/v2/checkout/orders/${data.orderId}/capture`, {
        method: "POST",
        headers: { "PayPal-Request-Id": `pp-capture-${data.orderId}` },
      });
    } catch (e) {
      await supabaseAdmin.from("payments").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", pay.id);
      throw e;
    }
    const capture = result?.purchase_units?.[0]?.payments?.captures?.[0];
    const amountOk =
      capture && Number(capture.amount?.value) === Number(pay.amount) && capture.amount?.currency_code === pay.currency;
    const completed = result.status === "COMPLETED" && capture?.status === "COMPLETED" && amountOk;
    await supabaseAdmin
      .from("payments")
      .update({
        status: completed ? "completed" : capture?.status === "PENDING" ? "approved" : "failed",
        paypal_capture_id: capture?.id ?? null,
        raw: result,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pay.id);
    if (completed) {
      await supabaseAdmin.from("milestones").update({ status: "paid", updated_at: new Date().toISOString() }).eq("id", ms.id);
      if (pay.payee_id)
        await supabaseAdmin.from("notifications").insert({
          user_id: pay.payee_id,
          type: "payment",
          title: `Payment received: ${ms.title}`,
          message: `${pay.currency} ${Number(pay.amount).toFixed(2)} was paid via PayPal (capture ${capture.id}).`,
          link: `/milestones/${ms.id}`,
        });
    }
    return { status: completed ? "completed" : (capture?.status ?? result.status), captureId: capture?.id ?? null };
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

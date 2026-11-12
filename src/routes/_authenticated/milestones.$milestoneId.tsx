import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2, Paperclip, Link2, CheckCircle2, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { reviewSubmission, reconcilePayment } from "@/lib/pacepay.functions";
import { money, date } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { PayPalButton } from "@/components/PayPalButton";
import { AIReview } from "@/components/AIReview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/milestones/$milestoneId")({
  head: () => ({ meta: [{ title: "Milestone — PacePay" }, { name: "description", content: "Milestone submissions, AI review, approval and payment." }, { property: "og:title", content: "Milestone — PacePay" }, { property: "og:description", content: "Review and pay a milestone." }] }),
  component: MilestonePage,
});

function MilestonePage() {
  const { milestoneId } = Route.useParams();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const review = useServerFn(reviewSubmission);
  const key = ["milestone", milestoneId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data: m } = await supabase.from("milestones").select("*, projects(*)").eq("id", milestoneId).single();
      const { data: subs } = await supabase.from("submissions").select("*, ai_reviews(*)").eq("milestone_id", milestoneId).order("version", { ascending: false });
      const { data: approvals } = await supabase.from("approvals").select("*").eq("milestone_id", milestoneId).order("created_at", { ascending: false });
      const { data: payments } = await supabase.from("payments").select("*").eq("milestone_id", milestoneId).order("created_at", { ascending: false });
      const { data: disputes } = await supabase.from("disputes").select("*").eq("milestone_id", milestoneId).order("created_at", { ascending: false });
      const payIds = (payments ?? []).map((x) => x.id);
      const { data: refunds } = payIds.length ? await supabase.from("refunds").select("*").in("payment_id", payIds).order("created_at", { ascending: false }) : { data: [] };
      return { m, subs: subs ?? [], approvals: approvals ?? [], payments: payments ?? [], disputes: disputes ?? [], refunds: refunds ?? [] };
    },
  });
  const refresh = () => qc.invalidateQueries();
  const [reviewing, setReviewing] = useState<string | null>(null);

  if (!data?.m) return <p className="text-muted-foreground">Loading…</p>;
  const { m, subs, approvals, payments, disputes, refunds } = data;
  const openDispute = disputes.find((d) => d.status === "open");
  const p = m.projects as any;
  const isClient = me?.user.id === p.client_id;
  const isFreelancer = me?.user.id === p.freelancer_id;
  const latest = subs[0];
  const canSubmit = isFreelancer && ["pending", "in_progress", "revision_requested"].includes(m.status);

  async function runReview(id: string) {
    setReviewing(id);
    try { await review({ data: { submissionId: id } }); toast.success("AI deliverable verification complete"); refresh(); }
    catch (e: any) { toast.error(e.message); }
    finally { setReviewing(null); }
  }

  return (
    <div className="space-y-8">
      <div>
        <Link to="/projects/$projectId" params={{ projectId: p.id }} className="text-sm text-muted-foreground hover:text-foreground">← {p.title}</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-bold">{m.title}</h1><StatusBadge status={m.status} /></div>
        <p className="mt-2 text-muted-foreground">{m.description}</p>
        <div className="mt-4 flex gap-6 font-mono text-sm"><span className="text-primary">{money(m.amount, m.currency)}</span><span className="text-muted-foreground">due {date(m.deadline)}</span></div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Box title="Requirements" text={m.requirements} />
        <Box title="Deliverables" text={m.deliverables} />
      </div>

      {canSubmit && <SubmitForm m={m} version={(latest?.version ?? 0) + 1} userId={me!.user.id} onDone={async (id) => { refresh(); await runReview(id); }} />}

      {isClient && m.status === "submitted" && latest && <Decision submissionId={latest.id} onDone={refresh} />}

      {isClient && m.status === "approved" && !openDispute && (
        <div className="rounded-2xl border border-primary/40 bg-card p-6">
          <h2 className="text-lg font-semibold">Pay this milestone</h2>
          <p className="mt-1 text-sm text-muted-foreground">You'll pay <b className="text-foreground">{money(m.amount, m.currency)}</b> for “{m.title}” via PayPal Sandbox. The amount comes from the approved milestone and can't be changed here. Status updates only after PayPal confirms the capture.</p>
          <div className="mt-4"><PayPalButton milestoneId={m.id} currency={m.currency} onDone={refresh} /></div>
        </div>
      )}

      {payments.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 font-semibold">Payment status</h2>
          {payments.map((pay) => (
            <div key={pay.id} className="flex flex-wrap items-center justify-between gap-2 py-1 text-sm">
              <span className="font-mono text-xs text-muted-foreground">Order {pay.paypal_order_id ?? "—"}{pay.paypal_capture_id ? ` · Capture ${pay.paypal_capture_id}` : ""}{pay.status_detail ? ` · ${pay.status_detail}` : ""}</span>
              <span className="flex items-center gap-2"><span className="font-mono">{money(pay.amount, pay.currency)}{Number(pay.refunded_amount) > 0 ? ` (−${money(pay.refunded_amount, pay.currency)})` : ""}</span><StatusBadge status={pay.status} />{["created", "approved", "pending"].includes(pay.status) && pay.paypal_order_id && <CheckButton id={pay.id} onDone={refresh} />}</span>
            </div>
          ))}
        </div>
      )}

      {refunds.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 font-semibold">Refunds</h2>
          {refunds.map((r) => <div key={r.id} className="flex justify-between py-1 text-sm"><span className="font-mono text-xs text-muted-foreground">{date(r.created_at)} · Refund {r.paypal_refund_id ?? "—"}</span><span className="font-mono">{money(r.amount, r.currency)} · {r.status.toLowerCase()}</span></div>)}
        </div>
      )}

      <Disputes m={m} disputes={disputes} canOpen={(isClient || isFreelancer) && !openDispute && ["submitted", "revision_requested", "approved", "paid"].includes(m.status)} isClient={isClient} userId={me?.user.id} onDone={refresh} />

      <div>
        <h2 className="mb-3 text-xl font-semibold">Submission history</h2>
        {subs.length === 0 && <p className="text-sm text-muted-foreground">No submissions yet.</p>}
        <div className="space-y-4">
          {subs.map((s) => {
            const reviews = ((s.ai_reviews as any[]) ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at));
            const appr = approvals.find((a) => a.submission_id === s.id);
            return (
              <div key={s.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-xs text-primary">v{s.version} · {date(s.submitted_at)}</p>
                  {appr && <StatusBadge status={appr.status} />}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{s.description}</p>
                <Evidence urls={s.evidence_urls} files={s.evidence_files} />
                {appr?.comments && <p className="mt-3 rounded-lg bg-secondary p-3 text-sm"><b>Client:</b> {appr.comments}</p>}
                {reviews.map((ai, index) => <AIReview key={ai.id} r={ai} defaultOpen={index === 0} />)}
                <Button size="sm" variant="outline" className="mt-4" disabled={reviewing === s.id} onClick={() => runReview(s.id)}>
                  {reviewing === s.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{reviewing === s.id ? "Inspecting deliverables…" : reviews.length ? "Reinspect deliverables" : "Run AI deliverable verification"}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Box({ title, text }: { title: string; text: string }) {
  return <div className="rounded-2xl border border-border bg-card p-5"><h2 className="font-semibold">{title}</h2><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{text || "—"}</p></div>;
}

function Evidence({ urls, files }: { urls: string[]; files: string[] }) {
  async function open(path: string) {
    const { data, error } = await supabase.storage.from("evidence").createSignedUrl(path, 300);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }
  if (!urls.length && !files.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {urls.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs hover:text-primary"><Link2 className="h-3 w-3" />{u.replace(/^https?:\/\//, "").slice(0, 40)}</a>)}
      {files.map((f) => <button key={f} onClick={() => open(f)} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs hover:text-primary"><Paperclip className="h-3 w-3" />{f.split("/").pop()}</button>)}
    </div>
  );
}

function SubmitForm({ m, version, userId, onDone }: { m: any; version: number; userId: string; onDone: (id: string) => void }) {
  const [desc, setDesc] = useState("");
  const [urls, setUrls] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (desc.trim().length < 10) { toast.error("Describe what you delivered (10+ characters)"); return; }
    const evidence_urls = urls.split(/\s+/).map((u) => u.trim()).filter(Boolean);
    if (evidence_urls.length > 5 || evidence_urls.some((u) => !/^https?:\/\/\S+$/i.test(u))) { toast.error("Add up to 5 valid http(s) evidence links"); return; }
    if ((files?.length ?? 0) > 8) { toast.error("Upload up to 8 files per submission"); return; }
    if (Array.from(files ?? []).some((f) => f.size > 20 * 1024 * 1024)) { toast.error("Each file must be 20MB or smaller"); return; }
    setBusy(true);
    const paths: string[] = [];
    for (const f of Array.from(files ?? [])) {
      const path = `${m.project_id}/${m.id}/${Date.now()}-${f.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage.from("evidence").upload(path, f);
      if (error) { setBusy(false); { toast.error(error.message); return; } }
      paths.push(path);
    }
    const { data, error } = await supabase.from("submissions").insert({ milestone_id: m.id, project_id: m.project_id, submitted_by: userId, description: desc, evidence_urls, evidence_files: paths, version }).select().single();
    setBusy(false);
    if (error || !data) { toast.error(error?.message ?? "Failed"); return; }
    toast.success("Submitted — running AI review…");
    setDesc(""); setUrls(""); setFiles(null);
    onDone(data.id);
  }
  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold">Submit work {version > 1 && <span className="font-mono text-sm text-muted-foreground">(v{version})</span>}</h2>
      <div className="space-y-1.5"><Label>What did you deliver?</Label><Textarea rows={5} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Explain how each requirement is met…" /></div>
      <div className="space-y-1.5"><Label>Evidence links (space or newline separated)</Label><Textarea rows={2} value={urls} onChange={(e) => setUrls(e.target.value)} placeholder="https://github.com/… https://staging.example.com" /></div>
      <div className="space-y-1.5"><Label>Files (max 20MB each)</Label><Input type="file" multiple onChange={(e) => setFiles(e.target.files)} /></div>
      <Button onClick={submit} disabled={busy}>{busy ? "Submitting…" : "Submit for review"}</Button>
    </div>
  );
}

function Decision({ submissionId, onDone }: { submissionId: string; onDone: () => void }) {
  const [comments, setComments] = useState("");
  async function decide(approve: boolean) {
    if (!approve && !comments.trim()) { toast.error("Tell the freelancer what to revise"); return; }
    const { error } = await supabase.rpc("decide_milestone", { _submission_id: submissionId, _approve: approve, _comments: comments });
    if (error) { toast.error(error.message); return; }
    toast.success(approve ? "Milestone approved" : "Revision requested");
    onDone();
  }
  return (
    <div className="space-y-4 rounded-2xl border border-warning/40 bg-card p-6">
      <h2 className="text-lg font-semibold">Your decision</h2>
      <p className="text-sm text-muted-foreground">Review the evidence and AI evaluation below. You're the final authority.</p>
      <Textarea value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Comments (required for revisions)" />
      <div className="flex gap-2">
        <AlertDialog>
          <AlertDialogTrigger asChild><Button><CheckCircle2 className="mr-2 h-4 w-4" />Approve</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Approve this milestone?</AlertDialogTitle><AlertDialogDescription>This confirms the work meets the requirements and unlocks payment.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => decide(true)}>Approve</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button variant="outline" onClick={() => decide(false)}><RotateCcw className="mr-2 h-4 w-4" />Request revision</Button>
      </div>
    </div>
  );
}

function CheckButton({ id, onDone }: { id: string; onDone: () => void }) {
  const check = useServerFn(reconcilePayment);
  const [busy, setBusy] = useState(false);
  return <Button size="sm" variant="outline" disabled={busy} onClick={async () => { setBusy(true); try { const r = await check({ data: { paymentId: id } }); toast.info(`PayPal status: ${r.status.replace(/_/g, " ")}`); onDone(); } catch (e: any) { toast.error(e.message); } setBusy(false); }}>Check with PayPal</Button>;
}

function Disputes({ m, disputes, canOpen, isClient, userId, onDone }: { m: any; disputes: any[]; canOpen: boolean; isClient: boolean; userId: string | undefined; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState("");
  const [show, setShow] = useState(false);
  async function open() {
    if (reason.trim().length < 10) { toast.error("Explain the problem (10+ characters)"); return; }
    const { error } = await supabase.from("disputes").insert({ project_id: m.project_id, milestone_id: m.id, opened_by: userId!, reason: reason.trim(), requested_refund: m.status === "paid" && isClient && refund ? Number(refund) : null });
    if (error) { toast.error(error.message); return; }
    toast.success("Dispute opened. A PacePay admin will review it.");
    setShow(false); setReason(""); setRefund(""); onDone();
  }
  if (!disputes.length && !canOpen) return null;
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between"><h2 className="font-semibold">Disputes</h2>{canOpen && !show && <Button size="sm" variant="outline" onClick={() => setShow(true)}>{m.status === "paid" && isClient ? "Request a refund" : "Open a dispute"}</Button>}</div>
      {show && (
        <div className="space-y-3">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What went wrong? Which requirements weren't met?" />
          {m.status === "paid" && isClient && <div className="space-y-1.5"><Label>Refund you're asking for ({m.currency}, optional)</Label><Input type="number" min={0} max={m.amount} value={refund} onChange={(e) => setRefund(e.target.value)} /></div>}
          <p className="text-xs text-muted-foreground">An admin reviews the reason and the completed work, then decides. Payment is paused while a dispute is open.</p>
          <div className="flex gap-2"><Button size="sm" onClick={open}>Submit</Button><Button size="sm" variant="ghost" onClick={() => setShow(false)}>Cancel</Button></div>
        </div>
      )}
      {disputes.map((d) => (
        <div key={d.id} className="rounded-lg bg-secondary p-3 text-sm">
          <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{date(d.created_at)}</span><StatusBadge status={d.status} /></div>
          <p className="mt-1 whitespace-pre-wrap">{d.reason}</p>
          {d.status === "resolved" && <p className="mt-2"><b>Decision:</b> {d.outcome?.replace(/_/g, " ")}{d.refund_amount ? ` (${money(d.refund_amount, m.currency)})` : ""} — {d.resolution_notes}</p>}
        </div>
      ))}
    </div>
  );
}

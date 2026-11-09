import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2, Paperclip, Link2, CheckCircle2, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { reviewSubmission } from "@/lib/pacepay.functions";
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
      return { m, subs: subs ?? [], approvals: approvals ?? [], payments: payments ?? [] };
    },
  });
  const refresh = () => qc.invalidateQueries();
  const [reviewing, setReviewing] = useState<string | null>(null);

  if (!data?.m) return <p className="text-muted-foreground">Loading…</p>;
  const { m, subs, approvals, payments } = data;
  const p = m.projects as any;
  const isClient = me?.user.id === p.client_id;
  const isFreelancer = me?.user.id === p.freelancer_id;
  const latest = subs[0];
  const canSubmit = isFreelancer && ["pending", "in_progress", "revision_requested"].includes(m.status);

  async function runReview(id: string) {
    setReviewing(id);
    try { await review({ data: { submissionId: id } }); toast.success("AI review complete"); refresh(); }
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

      {isClient && m.status === "approved" && (
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
              <span className="font-mono text-xs text-muted-foreground">Order {pay.paypal_order_id}{pay.paypal_capture_id ? ` · Capture ${pay.paypal_capture_id}` : ""}</span>
              <span className="flex items-center gap-2"><span className="font-mono">{money(pay.amount, pay.currency)}</span><StatusBadge status={pay.status} /></span>
            </div>
          ))}
        </div>
      )}

      <div>
        <h2 className="mb-3 text-xl font-semibold">Submission history</h2>
        {subs.length === 0 && <p className="text-sm text-muted-foreground">No submissions yet.</p>}
        <div className="space-y-4">
          {subs.map((s) => {
            const ai = ((s.ai_reviews as any[]) ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
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
                {ai ? <AIReview r={ai} /> : (
                  <Button size="sm" variant="outline" className="mt-4" disabled={reviewing === s.id} onClick={() => runReview(s.id)}>
                    {reviewing === s.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Run AI review
                  </Button>
                )}
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
    setBusy(true);
    const paths: string[] = [];
    for (const f of Array.from(files ?? [])) {
      const path = `${m.project_id}/${m.id}/${Date.now()}-${f.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage.from("evidence").upload(path, f);
      if (error) { setBusy(false); { toast.error(error.message); return; } }
      paths.push(path);
    }
    const evidence_urls = urls.split(/\s+/).map((u) => u.trim()).filter((u) => /^https?:\/\//.test(u));
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

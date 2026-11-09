import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, Plus, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { planProject } from "@/lib/pacepay.functions";
import { money } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/projects/new")({
  head: () => ({ meta: [{ title: "New project — PacePay" }, { name: "description", content: "Create a project with AI-planned milestones." }, { property: "og:title", content: "New project — PacePay" }, { property: "og:description", content: "Plan milestones with AI." }] }),
  component: NewProject,
});

type M = { title: string; description: string; requirements: string; deliverables: string; amount: number; deadline: string | null };
const blank = (): M => ({ title: "", description: "", requirements: "", deliverables: "", amount: 0, deadline: null });

function NewProject() {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const plan = useServerFn(planProject);
  const [f, setF] = useState({ title: "", description: "", requirements: "", budget: 1000, currency: "USD", deadline: "", freelancer_email: "" });
  const [ms, setMs] = useState<M[]>([]);
  const [risks, setRisks] = useState<string[]>([]);
  const [planning, setPlanning] = useState(false);
  const [saving, setSaving] = useState(false);

  if (me?.role !== "client") return <p className="text-muted-foreground">Only clients can create projects.</p>;
  const total = ms.reduce((s, m) => s + Number(m.amount || 0), 0);

  async function runPlan() {
    if (!f.title) return toast.error("Add a title first");
    setPlanning(true);
    try {
      const r = await plan({ data: { title: f.title, description: f.description, requirements: f.requirements, budget: Number(f.budget), currency: f.currency, deadline: f.deadline || null } });
      setMs(r.milestones);
      setRisks(r.risks);
      toast.success("AI drafted a plan — review and edit before saving");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPlanning(false);
    }
  }

  async function save() {
    if (!f.title) return toast.error("Title is required");
    if (ms.some((m) => !m.title)) return toast.error("Every milestone needs a title");
    setSaving(true);
    const { data: p, error } = await supabase
      .from("projects")
      .insert({ title: f.title, description: f.description, requirements: f.requirements, budget: Number(f.budget), currency: f.currency, deadline: f.deadline || null, freelancer_email: f.freelancer_email.trim() || null, client_id: me!.user.id, start_date: new Date().toISOString().slice(0, 10) })
      .select()
      .single();
    if (error || !p) { setSaving(false); return toast.error(error?.message ?? "Failed"); }
    if (ms.length) {
      const { error: e2 } = await supabase.from("milestones").insert(ms.map((m, i) => ({ ...m, amount: Number(m.amount), deadline: m.deadline || null, project_id: p.id, currency: f.currency, sequence: i + 1 })));
      if (e2) toast.error(e2.message);
    }
    setSaving(false);
    navigate({ to: "/projects/$projectId", params: { projectId: p.id } });
  }

  const up = (i: number, k: keyof M, v: any) => setMs(ms.map((m, j) => (j === i ? { ...m, [k]: v } : m)));

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">New project</h1>
      <div className="grid gap-4 rounded-2xl border border-border bg-card p-6 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2"><Label>Title</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Marketing website redesign" /></div>
        <div className="space-y-1.5 md:col-span-2"><Label>Description</Label><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div className="space-y-1.5 md:col-span-2"><Label>Requirements</Label><Textarea value={f.requirements} onChange={(e) => setF({ ...f, requirements: e.target.value })} placeholder="One per line" /></div>
        <div className="space-y-1.5"><Label>Budget</Label><Input type="number" min={0} value={f.budget} onChange={(e) => setF({ ...f, budget: Number(e.target.value) })} /></div>
        <div className="space-y-1.5"><Label>Currency</Label><Input value={f.currency} maxLength={3} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} /></div>
        <div className="space-y-1.5"><Label>Deadline</Label><Input type="date" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Freelancer email (invite)</Label><Input type="email" value={f.freelancer_email} onChange={(e) => setF({ ...f, freelancer_email: e.target.value })} placeholder="freelancer@example.com" /></div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">Milestones <span className="font-mono text-sm text-muted-foreground">{money(total, f.currency)} / {money(f.budget, f.currency)}</span></h2>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setMs([...ms, blank()])}><Plus className="mr-1 h-4 w-4" />Add</Button>
            <Button onClick={runPlan} disabled={planning} className="bg-gradient-primary">{planning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Plan with AI</Button>
          </div>
        </div>
        {risks.length > 0 && (
          <div className="rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm"><p className="font-medium text-warning">AI-identified risks</p><ul className="mt-2 list-disc pl-5 text-muted-foreground">{risks.map((r) => <li key={r}>{r}</li>)}</ul></div>
        )}
        {ms.map((m, i) => (
          <div key={i} className="grid gap-3 rounded-2xl border border-border bg-card p-5 md:grid-cols-4">
            <div className="flex items-center gap-2 md:col-span-4"><span className="font-mono text-xs text-primary">#{i + 1}</span><Input value={m.title} onChange={(e) => up(i, "title", e.target.value)} placeholder="Milestone title" /><Button variant="ghost" size="icon" onClick={() => setMs(ms.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button></div>
            <Textarea className="md:col-span-4" value={m.description} onChange={(e) => up(i, "description", e.target.value)} placeholder="Description" />
            <Textarea className="md:col-span-2" value={m.requirements} onChange={(e) => up(i, "requirements", e.target.value)} placeholder="Requirements (one per line)" />
            <Textarea className="md:col-span-2" value={m.deliverables} onChange={(e) => up(i, "deliverables", e.target.value)} placeholder="Deliverables (one per line)" />
            <div className="space-y-1"><Label className="text-xs">Amount</Label><Input type="number" min={0} value={m.amount} onChange={(e) => up(i, "amount", Number(e.target.value))} /></div>
            <div className="space-y-1"><Label className="text-xs">Deadline</Label><Input type="date" value={m.deadline ?? ""} onChange={(e) => up(i, "deadline", e.target.value || null)} /></div>
          </div>
        ))}
      </div>
      <Button size="lg" onClick={save} disabled={saving}>{saving ? "Saving…" : "Confirm & create project"}</Button>
    </div>
  );
}

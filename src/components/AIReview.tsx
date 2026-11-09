import { Sparkles } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";

export function AIReview({ r }: { r: any }) {
  const list = (t: string, items: string[], cls: string) => items?.length ? <div><p className={`text-xs font-medium ${cls}`}>{t}</p><ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">{items.map((i) => <li key={i}>{i}</li>)}</ul></div> : null;
  return (
    <div className="mt-4 space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><span className="text-sm font-medium">AI evaluation</span><StatusBadge status={r.recommendation} /><span className="font-mono text-xs text-muted-foreground">confidence {Math.round(Number(r.confidence) * 100)}%</span></div>
      <p className="text-sm">{r.summary}</p>
      <div className="grid gap-3 md:grid-cols-3">
        {list("Satisfied", r.requirements_satisfied, "text-primary")}
        {list("Missing", r.missing_requirements, "text-destructive")}
        {list("Issues", r.issues, "text-warning")}
      </div>
      <p className="text-xs text-muted-foreground">AI is advisory only — the client makes the final decision.</p>
    </div>
  );
}


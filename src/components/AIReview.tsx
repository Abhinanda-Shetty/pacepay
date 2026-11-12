import { FileCheck2, Link2, Sparkles } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { date } from "@/lib/format";

type RequirementResult = {
  requirement: string;
  status: "VERIFIED" | "PARTIALLY_VERIFIED" | "NOT_VERIFIED" | "UNABLE_TO_VERIFY";
  evidence: string;
  explanation: string;
  missingFunctionality: string;
  suggestions: string;
};

type Inspection = { source: string; kind: string; status: string; detail: string };

export function AIReview({ r, defaultOpen = true }: { r: any; defaultOpen?: boolean }) {
  const results = (r.requirement_results ?? []) as RequirementResult[];
  const inspections = (r.inspected_evidence ?? []) as Inspection[];
  const legacyList = (title: string, items: string[]) => items?.length ? <div><p className="text-xs font-medium">{title}</p><ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">{items.map((item) => <li key={item}>{item}</li>)}</ul></div> : null;
  return (
    <details open={defaultOpen} className="group mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" /><span className="text-sm font-medium">AI deliverable verification</span><StatusBadge status={r.recommendation} />
        <span className="ml-auto font-mono text-xs text-muted-foreground">{date(r.created_at)} · {Math.round(Number(r.confidence) * 100)}% confidence</span>
      </summary>
      <div className="mt-4 space-y-4">
        <p className="text-sm">{r.summary}</p>
        {inspections.length > 0 && (
          <div className="space-y-2 rounded-lg border border-border bg-card/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evidence inspected</p>
            {inspections.map((item, index) => (
              <div key={`${item.source}-${index}`} className="flex gap-2 text-xs">
                {item.kind === "website" || item.kind === "github" ? <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> : <FileCheck2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />}
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="max-w-full truncate font-medium">{item.source}</span><StatusBadge status={item.status} /></div><p className="mt-1 text-muted-foreground">{item.detail}</p></div>
              </div>
            ))}
          </div>
        )}
        {results.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Requirement-wise report</p>
            {results.map((item, index) => (
              <div key={`${item.requirement}-${index}`} className="rounded-lg border border-border bg-card/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2"><p className="text-sm font-medium">{item.requirement}</p><StatusBadge status={item.status} /></div>
                <dl className="mt-3 grid gap-3 text-xs md:grid-cols-2">
                  <div><dt className="font-semibold text-primary">Supporting evidence</dt><dd className="mt-1 whitespace-pre-wrap text-muted-foreground">{item.evidence || "No supporting evidence found."}</dd></div>
                  <div><dt className="font-semibold">Explanation</dt><dd className="mt-1 whitespace-pre-wrap text-muted-foreground">{item.explanation}</dd></div>
                  <div><dt className="font-semibold text-destructive">Missing functionality</dt><dd className="mt-1 whitespace-pre-wrap text-muted-foreground">{item.missingFunctionality || "None identified."}</dd></div>
                  <div><dt className="font-semibold text-warning">Improvement suggestions</dt><dd className="mt-1 whitespace-pre-wrap text-muted-foreground">{item.suggestions || "No changes suggested."}</dd></div>
                </dl>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">{legacyList("Satisfied", r.requirements_satisfied)}{legacyList("Missing", r.missing_requirements)}{legacyList("Issues", r.issues)}</div>
        )}
        {results.length > 0 && r.issues?.length > 0 && <div>{legacyList("Additional issues", r.issues)}</div>}
        <p className="text-xs text-muted-foreground">AI is advisory only. The client retains full authority over approval, revisions and payment release.</p>
      </div>
    </details>
  );
}

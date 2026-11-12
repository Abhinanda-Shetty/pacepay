import { cn } from "@/lib/utils";
import { statusLabel } from "@/lib/format";

const tone: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  in_progress: "bg-info/15 text-info",
  submitted: "bg-warning/15 text-warning",
  revision_requested: "bg-destructive/15 text-destructive",
  approved: "bg-primary/15 text-primary",
  paid: "bg-primary text-primary-foreground",
  active: "bg-info/15 text-info",
  completed: "bg-primary/15 text-primary",
  created: "bg-muted text-muted-foreground",
  failed: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
  refunded: "bg-warning/15 text-warning",
  partially_refunded: "bg-warning/15 text-warning",
  open: "bg-warning/15 text-warning",
  resolved: "bg-primary/15 text-primary",
  accepted: "bg-primary/15 text-primary",
  rejected: "bg-destructive/15 text-destructive",
  withdrawn: "bg-muted text-muted-foreground",
  APPROVE: "bg-primary/15 text-primary",
  REVISION_REQUIRED: "bg-destructive/15 text-destructive",
  MANUAL_REVIEW: "bg-warning/15 text-warning",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", tone[status] ?? "bg-muted text-muted-foreground", className)}>
      {statusLabel(status).toLowerCase()}
    </span>
  );
}

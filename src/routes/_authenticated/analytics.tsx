import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, colorSchemeDark, type ColDef } from "ag-grid-community";
import { Download, Wallet, Undo2, Hourglass, XCircle, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { money, date, statusLabel } from "@/lib/format";
import { summarize, type Totals } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

ModuleRegistry.registerModules([AllCommunityModule]);

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Analytics — PacePay" }, { name: "description", content: "Searchable payment analytics with CSV export." }, { property: "og:title", content: "Analytics — PacePay" }, { property: "og:description", content: "Your PacePay payment records in one sortable table." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Analytics,
});

const theme = themeQuartz.withPart(colorSchemeDark).withParams({
  backgroundColor: "var(--card)",
  foregroundColor: "var(--foreground)",
  headerBackgroundColor: "var(--secondary)",
  borderColor: "var(--border)",
  accentColor: "var(--primary)",
  fontFamily: "inherit",
});

type Row = { id: string; date: string; project: string; milestone: string; milestoneId: string; amount: number; refunded: number; net: number; currency: string; status: string; orderId: string; captureId: string; detail: string };

const fmtTotals = (t: Totals) => {
  const e = Object.entries(t);
  return e.length ? e.map(([c, n]) => money(n, c)).join(" · ") : money(0);
};

function Kpi({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string | number; hint: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <Icon className="h-5 w-5 text-primary" />
      <p className="mt-3 font-display text-2xl font-bold break-words">{value}</p>
      <p className="text-sm">{label}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Analytics() {
  const { data: me } = useMe();
  const grid = useRef<AgGridReact<Row>>(null);
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(0);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["analytics", me?.user.id],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase.from("payments").select("*, projects(title), milestones(title)").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const role = me?.role ?? null;
  const uid = me?.user.id ?? "";
  const mine = useMemo(() => (data ?? []).filter((p) => role === "admin" || (role === "freelancer" ? p.payee_id === uid : p.payer_id === uid)), [data, role, uid]);
  const s = useMemo(() => summarize(mine, uid, role), [mine, uid, role]);
  const rows = useMemo<Row[]>(() => mine.map((p) => {
    const amount = Number(p.amount) || 0;
    const refunded = Math.min(amount, Number(p.refunded_amount) || 0);
    const settled = ["completed", "partially_refunded", "refunded"].includes(p.status);
    return { id: p.id, date: p.created_at, project: (p.projects as any)?.title ?? "—", milestone: (p.milestones as any)?.title ?? "—", milestoneId: p.milestone_id, amount, refunded, net: settled ? amount - refunded : 0, currency: p.currency || "USD", status: p.status, orderId: p.paypal_order_id ?? "", captureId: p.paypal_capture_id ?? "", detail: p.status_detail ?? "" };
  }), [mine]);

  const cols = useMemo<ColDef<Row>[]>(() => [
    { field: "date", headerName: "Date", sort: "desc", valueFormatter: (v) => date(v.value), filter: "agDateColumnFilter", filterValueGetter: (p) => (p.data ? new Date(p.data.date) : null), minWidth: 120 },
    { field: "project", headerName: "Project", filter: true, minWidth: 160 },
    { field: "milestone", headerName: "Milestone", filter: true, minWidth: 160, cellRenderer: (p: any) => p.data ? <Link to="/milestones/$milestoneId" params={{ milestoneId: p.data.milestoneId }} className="hover:text-primary">{p.value}</Link> : null },
    { field: "amount", headerName: "Amount", filter: "agNumberColumnFilter", valueFormatter: (v) => money(v.value, v.data?.currency), minWidth: 110 },
    { field: "refunded", headerName: "Refunded", filter: "agNumberColumnFilter", valueFormatter: (v) => money(v.value, v.data?.currency), minWidth: 110 },
    { field: "net", headerName: "Net settled", filter: "agNumberColumnFilter", valueFormatter: (v) => money(v.value, v.data?.currency), minWidth: 120 },
    { field: "currency", headerName: "Currency", filter: true, minWidth: 110 },
    { field: "status", headerName: "Status", filter: true, valueFormatter: (v) => statusLabel(v.value ?? ""), minWidth: 130 },
    { field: "orderId", headerName: "PayPal order ID", filter: true, minWidth: 170 },
    { field: "captureId", headerName: "PayPal capture ID", filter: true, minWidth: 170 },
    { field: "detail", headerName: "Note", filter: true, minWidth: 160 },
  ], []);

  const exportCsv = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    grid.current?.api.exportDataAsCsv({ fileName: `pacepay-payments-${stamp}.csv`, onlySelected: false, processCellCallback: (p) => p.column.getColId() === "date" ? new Date(p.value).toISOString() : p.value });
  };

  const netLabel = role === "freelancer" ? "Earned" : role === "admin" ? "Platform settled volume" : "Paid out";
  const scope = role === "admin" ? "All payments on PacePay" : role === "freelancer" ? "Payments you received" : "Payments you made";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl font-bold">Analytics</h1><p className="text-sm text-muted-foreground">{scope} · PayPal Sandbox records</p></div>
        <Button onClick={exportCsv} disabled={!visible}><Download className="mr-2 h-4 w-4" /> Export CSV</Button>
      </div>

      {error ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-5 text-sm">
          <AlertTriangle className="h-5 w-5 text-destructive" /><span className="flex-1">Couldn't load your payment records. Nothing is shown rather than showing wrong numbers.</span>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={Wallet} label={netLabel} value={isLoading ? "…" : fmtTotals(s.net)} hint={`${s.settled} confirmed by PayPal, net of refunds`} />
            <Kpi icon={Undo2} label="Refunded" value={isLoading ? "…" : fmtTotals(s.refunded)} hint="Issued after dispute decisions" />
            <Kpi icon={Hourglass} label="Awaiting PayPal" value={isLoading ? "…" : s.inFlight} hint="Started, not yet captured — not counted as money" />
            <Kpi icon={XCircle} label="Failed / cancelled" value={isLoading ? "…" : s.unsuccessful} hint="No money moved" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search project, milestone, PayPal ID…" className="max-w-sm" maxLength={100} />
            <span className="text-xs text-muted-foreground">{visible} of {rows.length} rows</span>
          </div>
          <div className="h-[520px] overflow-hidden rounded-2xl border border-border">
            <AgGridReact<Row>
              ref={grid}
              theme={theme}
              rowData={isLoading ? null : rows}
              columnDefs={cols}
              defaultColDef={{ sortable: true, resizable: true, flex: 1 }}
              quickFilterText={search}
              getRowId={(p) => p.data.id}
              pagination
              paginationPageSize={20}
              paginationPageSizeSelector={[20, 50, 100]}
              loading={isLoading}
              overlayNoRowsTemplate={rows.length ? "No rows match your search or filters." : "No payments yet — records appear here once a milestone payment is started."}
              onModelUpdated={(e) => setVisible(e.api.getDisplayedRowCount())}
            />
          </div>
          <p className="text-xs text-muted-foreground">Totals include only payments PayPal confirmed. Mixed currencies are shown separately, never added together. PacePay doesn't hold funds or offer escrow.</p>
        </>
      )}
    </div>
  );
}

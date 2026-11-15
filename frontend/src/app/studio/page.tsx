"use client";

// Home screen after login. It only displays tables and the activity log.
// The list reloads when the chatbot finishes an approved change.

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { SCHEMA_CHANGED } from "@/lib/events";
import { useSession } from "@/components/session-provider";
import type { AuditEntry, TableSummary } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function RegistryPage() {
  const { user } = useSession();
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [activity, setActivity] = useState<AuditEntry[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    let active = true;
    function load() {
      Promise.all([api<TableSummary[]>("/api/tables/"), api<AuditEntry[]>("/api/audit/?limit=5")])
        .then(([nextTables, nextActivity]) => {
          if (!active) return;
          setTables(nextTables);
          setActivity(nextActivity);
          setError("");
        })
        .catch((reason: Error) => {
          if (active) setError(reason.message);
        });
    }
    load();
    window.addEventListener(SCHEMA_CHANGED, load);
    return () => {
      active = false;
      window.removeEventListener(SCHEMA_CHANGED, load);
    };
  }, [user]);

  const records = tables.reduce((sum, table) => sum + (table.row_count || 0), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-sidebar px-8 py-8 text-sidebar-foreground shadow-xl">
        <div className="absolute -top-16 -right-10 size-56 rounded-full bg-sidebar-primary/30 blur-2xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs tracking-[0.22em] text-sidebar-primary uppercase">Student registry</p>
            <h1 className="font-display mt-2 text-5xl leading-none">Good to see you</h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-sidebar-foreground/80">
              Design a table, keep every record in one place, and approve changes from the chat button.
              New tables appear here as soon as you confirm them.
            </p>
          </div>
          <Link
            href="/studio/tables"
            className="inline-flex h-11 items-center rounded-full bg-sidebar-primary px-5 text-sm font-medium text-sidebar-primary-foreground"
          >
            Design a table
          </Link>
        </div>
      </section>

      {error && <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Tables" value={String(tables.length)} />
        <Stat label="Records" value={String(records)} />
        <Stat label="Signed in" value={user?.email.split("@")[0] || "—"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="font-display text-2xl">Your tables</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {tables.length === 0 && (
              <p className="text-sm leading-6 text-muted-foreground sm:col-span-2">
                Nothing is stored yet. Create the first table with the columns you need, including a primary key.
              </p>
            )}
            {tables.map((table) => (
              <Link
                key={table.table_name}
                href={`/studio/tables/${encodeURIComponent(table.table_name)}`}
                className="rounded-2xl bg-muted/60 px-4 py-4 ring-1 ring-foreground/5 transition hover:-translate-y-0.5 hover:bg-card hover:shadow-md"
              >
                <p className="font-display text-2xl">{table.table_name}</p>
                <p className="mt-2 text-xs tracking-wide text-muted-foreground uppercase">
                  {table.row_count} rows · {table.columns.length} columns
                </p>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="font-display text-2xl">Latest activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activity.length === 0 && <p className="text-sm text-muted-foreground">No changes yet.</p>}
            {activity.map((entry) => (
              <div key={entry.id} className="rounded-xl bg-muted/70 px-3 py-2">
                <p className="text-sm font-medium">{entry.action.replaceAll("_", " ")}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.table_name} · {entry.executed_by}
                </p>
              </div>
            ))}
            <Link href="/studio/activity" className="inline-flex text-sm font-medium text-primary">
              Open the full log
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
        <CardTitle className="truncate text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

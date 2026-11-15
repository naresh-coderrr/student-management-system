"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/components/session-provider";
import type { AuditEntry } from "@/lib/types";

export default function ActivityPage() {
  const { user } = useSession();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    api<AuditEntry[]>("/api/audit/?limit=80")
      .then(setEntries)
      .catch((reason: Error) => setError(reason.message));
  }, [user]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="font-display text-4xl">Activity</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every table change and every approved assistant action is kept here, including who signed it.
        </p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <ol className="space-y-3">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">{entry.description || entry.action}</p>
              <time className="text-xs text-muted-foreground">{new Date(entry.executed_at).toLocaleString()}</time>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {entry.table_name} · {entry.action} · {entry.executed_by}
            </p>
            {entry.sql_query && (
              <pre className="mt-2 overflow-x-auto rounded-lg bg-muted px-3 py-2 text-xs">{entry.sql_query}</pre>
            )}
          </li>
        ))}
        {entries.length === 0 && !error && <p className="text-sm text-muted-foreground">No activity yet.</p>}
      </ol>
    </div>
  );
}

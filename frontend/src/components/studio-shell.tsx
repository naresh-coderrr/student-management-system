"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  History,
  LayoutDashboard,
  LogOut,
  Search,
  Table2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useRequireSession } from "@/components/session-provider";
import { HoverChat } from "@/components/hover-chat";
import { api } from "@/lib/api";
import type { TableSummary } from "@/lib/types";

const NAV = [
  { href: "/studio", label: "Registry", icon: LayoutDashboard },
  { href: "/studio/tables", label: "Tables", icon: Table2 },
  { href: "/studio/activity", label: "Activity", icon: History },
];

export function StudioShell({ children }: { children: React.ReactNode }) {
  const session = useRequireSession();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tables, setTables] = useState<TableSummary[]>([]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open || !session.user) return;
    api<TableSummary[]>("/api/tables/")
      .then(setTables)
      .catch(() => setTables([]));
  }, [open, session.user]);

  const destinations = useMemo(() => {
    const pages = NAV.map((item) => ({ href: item.href, label: item.label, kind: "Page" }));
    const tableLinks = tables.map((table) => ({
      href: `/studio/tables/${encodeURIComponent(table.table_name)}`,
      label: table.table_name,
      kind: "Table",
    }));
    const needle = query.trim().toLowerCase();
    return [...pages, ...tableLinks].filter((item) => item.label.toLowerCase().includes(needle));
  }, [query, tables]);

  if (!session.ready || !session.user) {
    return (
      <div className="grid min-h-full place-items-center text-sm text-muted-foreground">
        Opening the registry…
      </div>
    );
  }

  return (
    <div className="registry-shell flex min-h-full">
      <aside className="sticky top-0 flex h-screen w-72 shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground">
        <div className="relative px-5 pt-7 pb-5">
          <div className="mb-4 grid size-11 place-items-center rounded-2xl bg-sidebar-primary text-lg font-semibold text-sidebar-primary-foreground shadow-lg">
            S
          </div>
          <p className="font-display text-2xl leading-tight">Student Management System</p>
          <p className="mt-2 text-xs tracking-[0.18em] text-sidebar-primary uppercase">Registry desk</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1.5 px-3">
          {NAV.map((item) => {
            const active = pathname === item.href || (item.href !== "/studio" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md"
                    : "text-sidebar-foreground/85 hover:bg-sidebar-accent"
                }`}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-4">
          <p className="truncate text-xs text-sidebar-foreground/75">{session.user.email}</p>
          <Button
            variant="ghost"
            className="mt-2 w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={() => {
              session.signOut();
              router.replace("/");
            }}
          >
            <LogOut />
            Sign out
          </Button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 px-8 py-4">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-11 w-full max-w-lg items-center gap-2 rounded-2xl border border-white/70 bg-card/80 px-4 text-sm text-muted-foreground shadow-sm backdrop-blur"
          >
            <Search className="size-4" />
            Jump to a table or page
            <span className="ml-auto rounded-md bg-muted px-1.5 py-0.5 text-xs">Ctrl K</span>
          </button>
        </header>
        <main className="flex-1 px-8 pb-8">{children}</main>
      </div>
      <HoverChat />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Go somewhere</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Table name or page"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="max-h-72 space-y-1 overflow-auto">
            {destinations.map((item) => (
              <button
                key={item.href}
                type="button"
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  setOpen(false);
                  setQuery("");
                  router.push(item.href);
                }}
              >
                <span>{item.label}</span>
                <span className="text-xs text-muted-foreground">{item.kind}</span>
              </button>
            ))}
            {destinations.length === 0 && (
              <p className="px-3 py-6 text-sm text-muted-foreground">Nothing matches that.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

// Floating chatbot.
// Viva: Records mode calls /api/llm/chat. A change waits for the password, then /api/llm/confirm.
// How to use mode calls /api/llm/help, which answers from the guide (RAG).

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RowsPreview } from "@/components/rows-preview";
import { api } from "@/lib/api";
import { notifySchemaChanged } from "@/lib/events";
import { useSession } from "@/components/session-provider";
import type { ChatReply } from "@/lib/types";

type Turn = {
  role: "user" | "assistant";
  content: string;
  reply?: ChatReply;
};

const PROMPTS = [
  "What tables do I have?",
  "Create a students table",
  "How do I change a column?",
];

export function HoverChat() {
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"data" | "guide">("data");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [pendingId, setPendingId] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy, open]);

  if (!user) return null;

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const history = turns.map((turn) => ({ role: turn.role, content: turn.content }));
    setTurns((current) => [...current, { role: "user", content: trimmed }]);
    setMessage("");
    setBusy(true);
    try {
      if (mode === "guide") {
        const result = await api<{ answer: string }>("/api/llm/help", {
          method: "POST",
          body: JSON.stringify({ question: trimmed }),
        });
        setTurns((current) => [...current, { role: "assistant", content: result.answer }]);
        return;
      }
      const reply = await api<ChatReply>("/api/llm/chat", {
        method: "POST",
        body: JSON.stringify({ message: trimmed, conversation_history: history }),
      });
      setTurns((current) => [...current, { role: "assistant", content: reply.message || "Done.", reply }]);
      if (reply.type === "confirm_action" && reply.action_id) setPendingId(reply.action_id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The assistant could not answer");
    } finally {
      setBusy(false);
    }
  }

  async function decide(confirmed: boolean) {
    if (!pendingId) return;
    setBusy(true);
    try {
      const result = await api<{ message: string }>("/api/llm/confirm", {
        method: "POST",
        body: JSON.stringify({ action_id: pendingId, confirmed, password: confirmed ? password : "" }),
      });
      setTurns((current) => [
        ...current,
        { role: "assistant", content: confirmed ? `Approved. ${result.message}` : result.message },
      ]);
      setPendingId("");
      setPassword("");
      if (confirmed) notifySchemaChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The change was not applied");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed right-5 bottom-5 z-40 flex flex-col items-end gap-3">
      {open && (
        <section className="flex h-[min(34rem,calc(100vh-7rem))] w-[min(24rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-foreground/10">
          <header className="flex items-start justify-between gap-3 bg-sidebar px-4 py-3 text-sidebar-foreground">
            <div>
              <p className="font-display text-lg leading-none">Assistant</p>
              <p className="mt-1 text-xs text-sidebar-foreground/75">Gemini · asks before any change</p>
            </div>
            <button type="button" aria-label="Close assistant" className="rounded-md p-1 hover:bg-sidebar-accent" onClick={() => setOpen(false)}>
              <X className="size-4" />
            </button>
          </header>
          <div className="flex gap-1 border-b border-border px-3 py-2">
            <button
              type="button"
              className={`rounded-full px-3 py-1 text-xs ${mode === "data" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              onClick={() => setMode("data")}
            >
              Records
            </button>
            <button
              type="button"
              className={`rounded-full px-3 py-1 text-xs ${mode === "guide" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              onClick={() => setMode("guide")}
            >
              How to use
            </button>
          </div>
          <div ref={scroller} className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {turns.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm leading-6 text-muted-foreground">
                  {mode === "data"
                    ? "Ask to create a table, look up a student, or change a value. You will see the current row and type your password before anything is saved."
                    : "Ask how this registry works. Answers come from the built-in guide."}
                </p>
                <div className="flex flex-col gap-1.5">
                  {PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="rounded-lg bg-muted px-3 py-2 text-left text-xs hover:bg-accent"
                      onClick={() => send(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((turn, index) => (
              <article
                key={index}
                className={`rounded-xl px-3 py-2 text-sm leading-6 ${
                  turn.role === "user" ? "ml-8 bg-primary text-primary-foreground" : "mr-4 bg-muted"
                }`}
              >
                <p className="whitespace-pre-wrap">{turn.content}</p>
                {turn.reply?.sql && (
                  <pre className="mt-2 overflow-x-auto rounded-md bg-card px-2 py-1.5 text-[11px] text-foreground">{turn.reply.sql}</pre>
                )}
                {turn.reply?.type === "confirm_action" && (
                  <div className="mt-2 space-y-2 text-foreground">
                    {turn.reply.affects_all && (
                      <p className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">This can touch every row.</p>
                    )}
                    <RowsPreview rows={turn.reply.preview_data} emptyLabel="No current row to show yet." />
                    {turn.reply.action_id === pendingId && (
                      <div className="space-y-2">
                        <Input
                          type="password"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          placeholder="Your password to approve"
                          className="h-9 bg-card"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" disabled={busy || !password} onClick={() => decide(true)}>
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => decide(false)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {(turn.reply?.type === "sql_preview" || turn.reply?.type === "info") && (
                  <div className="mt-2 space-y-1 text-foreground">
                    <RowsPreview
                      rows={turn.reply.preview_data}
                      emptyLabel={turn.reply.type === "sql_preview" ? "No matching records found in this table." : undefined}
                    />
                  </div>
                )}
              </article>
            ))}
            {busy && <p className="text-xs text-muted-foreground">Thinking…</p>}
          </div>
          <form
            className="flex items-center gap-2 border-t border-border p-2"
            onSubmit={(event) => {
              event.preventDefault();
              send(message);
            }}
          >
            <Input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={mode === "data" ? "Change or look up a record" : "Ask how something works"}
              className="h-9"
            />
            <Button type="submit" size="icon" disabled={busy || !message.trim()} aria-label="Send">
              <Send />
            </Button>
          </form>
        </section>
      )}
      <button
        type="button"
        aria-label={open ? "Hide assistant" : "Open assistant"}
        onClick={() => setOpen((value) => !value)}
        className="relative grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background transition-transform hover:-translate-y-0.5"
      >
        {open ? <X className="size-5" /> : <MessageCircle className="size-6" />}
        {!open && pendingId && <span className="absolute top-4 right-4 size-3 rounded-full bg-destructive ring-2 ring-background" />}
      </button>
    </div>
  );
}

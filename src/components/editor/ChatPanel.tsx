"use client";

import type Anthropic from "@anthropic-ai/sdk";
import clsx from "clsx";
import { Check, KeyRound, Loader2, Send, Sparkles, Trash2, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { aiFetch, getUserApiKey, setUserApiKey } from "@/ai/client";
import { executeTool } from "@/ai/execute";
import { computeRoomGeometry, formatM } from "@/model/geometry";
import { useEditor } from "@/store/editor";
import { Button, IconButton, TextInput } from "../ui";

type Msg = Anthropic.Beta.BetaMessageParam;
type Block = Anthropic.Beta.BetaContentBlock;

interface ChatResponse {
  content: Block[];
  stop_reason: string | null;
  notice?: string;
}

const TOOL_LABELS: Record<string, string> = {
  get_plan: "Plan gelesen",
  list_furniture_types: "Möbelkatalog gelesen",
  add_wall: "Wand gezeichnet",
  add_rect_room: "Raum angelegt",
  move_wall: "Wand verschoben",
  set_wall_length: "Wandlänge geändert",
  set_wall_thickness: "Wanddicke geändert",
  delete_elements: "Elemente gelöscht",
  add_opening: "Öffnung gesetzt",
  update_room: "Raum geändert",
  place_furniture: "Möbel platziert",
  move_furniture: "Möbel verschoben",
  stage_room: "Raum eingerichtet",
  clear_furniture: "Möbel entfernt",
};

const SUGGESTIONS = [
  "Richte alle Räume im skandinavischen Stil ein.",
  "Stell im Wohnbereich einen Esstisch für 6 Personen ans Fenster.",
  "Mach das Schlafzimmer 50 cm breiter.",
  "Welche Räume weichen von den Flächen im Plan ab?",
];

export function ChatPanel({ onClose }: { onClose: () => void }) {
  const [history, setHistory] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [key, setKey] = useState(() => getUserApiKey());
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, busy]);

  const send = async (text: string) => {
    const st = useEditor.getState();
    const floor = st.project?.floors.find((f) => f.id === st.floorId);
    if (!text.trim() || !floor) return;
    setInput("");
    setError(null);
    setBusy(true);
    const rooms = computeRoomGeometry(floor)
      .map((r) => `${r.meta.name} (${formatM(r.area)} m², id ${r.meta.id})`)
      .join("; ");
    const context = `[Kontext: Etage „${floor.name}“, ${floor.walls.length} Wände, ${floor.items.length} Möbel. Räume: ${rooms || "keine"}]`;
    let msgs: Msg[] = [...history, { role: "user", content: [{ type: "text", text: `${context}\n\n${text}` }] }];
    setHistory(msgs);
    // one undo step for the whole assistant turn
    st.checkpoint();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      for (let i = 0; i < 14; i++) {
        const res = await aiFetch<ChatResponse>("/api/ai/chat", { messages: msgs }, ac.signal);
        msgs = [...msgs, { role: "assistant", content: res.content as Anthropic.Beta.BetaContentBlockParam[] }];
        setHistory(msgs);
        if (res.notice) setError(res.notice);
        if (res.stop_reason !== "tool_use") break;
        const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
        for (const b of res.content) {
          if (b.type !== "tool_use") continue;
          const r = executeTool(b.name, b.input);
          results.push({ type: "tool_result", tool_use_id: b.id, content: r.result, is_error: !r.ok });
        }
        msgs = [...msgs, { role: "user", content: results }];
        setHistory(msgs);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(e instanceof Error ? e.message : "Fehler bei der Anfrage.");
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  // render
  const items: React.ReactNode[] = [];
  history.forEach((m, mi) => {
    const blocks = typeof m.content === "string" ? [{ type: "text", text: m.content } as const] : m.content;
    for (const [bi, b] of (blocks as Array<{ type: string } & Record<string, unknown>>).entries()) {
      const key = `${mi}-${bi}`;
      if (b.type === "text" && typeof b.text === "string" && b.text.trim()) {
        const txt = m.role === "user" ? b.text.replace(/^\[Kontext:[^\]]*\]\s*/, "") : b.text;
        items.push(
          <div
            key={key}
            className={clsx(
              "max-w-[92%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm",
              m.role === "user" ? "ml-auto bg-ink text-white" : "bg-paper",
            )}
          >
            {txt}
          </div>,
        );
      } else if (b.type === "tool_use") {
        const result = history[mi + 1];
        const res = Array.isArray(result?.content)
          ? (result.content as Array<{ type: string; tool_use_id?: string; is_error?: boolean }>).find(
              (r) => r.type === "tool_result" && r.tool_use_id === b.id,
            )
          : undefined;
        items.push(
          <div key={key} className="flex items-center gap-1.5 text-xs text-muted">
            {res ? (
              res.is_error ? (
                <TriangleAlert size={12} className="text-amber-600" />
              ) : (
                <Check size={12} className="text-green-700" />
              )
            ) : (
              <Loader2 size={12} className="animate-spin" />
            )}
            {TOOL_LABELS[b.name as string] ?? String(b.name)}
          </div>,
        );
      }
    }
  });

  return (
    <div className="flex h-full flex-col" data-testid="chat-panel">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles size={16} className="text-accent" /> KI-Assistent
        </div>
        <div className="flex items-center">
          <IconButton label="API-Key" onClick={() => setShowKey(!showKey)} active={showKey}>
            <KeyRound size={16} />
          </IconButton>
          <IconButton label="Verlauf leeren" onClick={() => setHistory([])} disabled={busy || !history.length}>
            <Trash2 size={16} />
          </IconButton>
          <IconButton label="Schließen" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
      </div>
      {showKey && (
        <div className="space-y-2 border-b border-line bg-paper p-3 text-xs">
          <p className="text-muted">
            Optional: eigener Claude-API-Key. Er wird nur in diesem Browser gespeichert und ersetzt den Server-Key.
          </p>
          <TextInput type="password" placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setUserApiKey(key.trim());
                setShowKey(false);
              }}
            >
              Speichern
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setUserApiKey("");
                setKey("");
              }}
            >
              Entfernen
            </Button>
          </div>
        </div>
      )}
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {history.length === 0 && (
          <div className="space-y-3 text-sm text-muted">
            <p>
              Beschreiben Sie, was am Grundriss passieren soll. Die KI ändert Wände, Räume und Möbel direkt im Plan.
            </p>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="block w-full rounded-lg border border-line bg-panel px-3 py-2 text-left text-xs text-ink hover:border-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {items}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted">
            <Loader2 size={14} className="animate-spin" /> Denkt nach …
            <button type="button" className="underline" onClick={() => abortRef.current?.abort()}>
              Abbrechen
            </button>
          </div>
        )}
        {error && <div className="rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</div>}
        <div ref={endRef} />
      </div>
      <form
        className="flex gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          rows={2}
          placeholder="z. B. Richte das Kinderzimmer für ein Schulkind ein"
          className="min-h-[2.5rem] flex-1 resize-none rounded-md border border-line bg-panel px-2 py-1.5 text-sm outline-none focus:border-accent"
          disabled={busy}
        />
        <Button type="submit" variant="primary" disabled={busy || !input.trim()} aria-label="Senden">
          <Send size={16} />
        </Button>
      </form>
    </div>
  );
}

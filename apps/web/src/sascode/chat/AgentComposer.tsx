// FILE: sascode/chat/AgentComposer.tsx
// Purpose: The single composer in the SASCODE workspace.
// Layer: Presentation + command dispatch.
//
// Extracted from the sheet so there is one obvious place the invariant lives:
// this is the only composer that mounts. The workbench shows work output and
// has no input of its own, which is what stopped the shell from rendering two
// competing conversations.

import { useCallback, useRef, useState } from "react";
import { IconArrowUp, IconPlus } from "@tabler/icons-react";

export interface AgentComposerProps {
  /** Names the recipients, e.g. "Workspace shell" or "Both sessions". */
  targetLabel: string;
  /** False when the message would start new work rather than continue it. */
  hasTarget: boolean;
  onSubmit: (text: string) => Promise<void> | void;
}

export function AgentComposer(props: AgentComposerProps) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const submit = useCallback(async () => {
    const text = draft.trim();
    if (text.length === 0 || sending) return;
    setSending(true);
    setError(null);
    try {
      await props.onSubmit(text);
      setDraft("");
      const element = inputRef.current;
      if (element) element.style.height = "auto";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send");
    } finally {
      setSending(false);
    }
  }, [draft, props, sending]);

  return (
    <div className="shrink-0 px-3 pt-1 pb-3">
      {error ? (
        <p
          className="mb-1.5 px-1 text-[11px]"
          role="status"
          style={{ color: "var(--sas-blocked-ink)" }}
        >
          {error}
        </p>
      ) : null}

      <div
        className="flex items-end gap-1.5 rounded-[var(--sas-radius-md)] p-2 ps-3.5"
        style={{
          backgroundColor: "var(--sas-surface-sunken)",
          border: "1px solid var(--sas-line)",
        }}
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            const element = event.target;
            element.style.height = "auto";
            element.style.height = `${Math.min(element.scrollHeight, 120)}px`;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={props.hasTarget ? "Ask agents anything…" : "Describe what you want built…"}
          aria-label={`Message ${props.targetLabel}`}
          className="sas-focusable max-h-[120px] min-h-[20px] w-full resize-none self-center bg-transparent text-[12.5px] leading-[1.45] outline-none"
          style={{ color: "var(--sas-text)" }}
        />

        <button
          type="button"
          aria-label="Attach context"
          className="sas-transition sas-focusable flex size-[30px] shrink-0 items-center justify-center rounded-[var(--sas-radius-xs)]"
          style={{ color: "var(--sas-text-secondary)" }}
          onClick={() => inputRef.current?.focus()}
        >
          <IconPlus size={16} stroke={1.7} />
        </button>

        {/* Quiet by default. The composer is always available, so a filled
            accent button here would shout on every frame of a calm workspace;
            it earns emphasis only once there is something to send. */}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={draft.trim().length === 0 || sending}
          aria-label="Send"
          className="sas-transition sas-focusable flex size-[30px] shrink-0 items-center justify-center rounded-[var(--sas-radius-xs)] disabled:opacity-60"
          style={
            draft.trim().length === 0
              ? { backgroundColor: "var(--sas-surface-raised)", color: "var(--sas-text-muted)" }
              : { backgroundColor: "var(--sas-accent)", color: "var(--sas-text-on-accent)" }
          }
        >
          <IconArrowUp size={16} stroke={2} />
        </button>
      </div>
    </div>
  );
}

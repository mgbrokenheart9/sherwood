"use client";

import { Check, Copy } from "@phosphor-icons/react/dist/ssr";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "@/lib/cn";
import { highlight } from "@/lib/highlight";

type CopyStatus = "idle" | "copied" | "error";

function useClipboard(text: string) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const [attempt, setAttempt] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
      setAttempt((value) => value + 1);
    } catch {
      setStatus("error");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), 2200);
  }, [text]);

  return { status, attempt, copy };
}

function CopyButton({ status, attempt, onCopy }: { status: CopyStatus; attempt: number; onCopy: () => void }) {
  const copied = status === "copied";
  return (
    <button type="button" className="copy__btn" onClick={onCopy} aria-label={copied ? "Copied" : "Copy to clipboard"}>
      <span className="t-icon-swap" data-state={copied ? "b" : "a"} aria-hidden="true">
        <span className="t-icon" data-icon="a">
          <Copy size={18} />
        </span>
        <span className="t-icon" data-icon="b">
          <motion.span
            key={attempt}
            className="copy__success"
            initial={{ scale: 0.4, rotate: -12 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 18 }}
          >
            <Check size={20} weight="bold" />
          </motion.span>
        </span>
      </span>
    </button>
  );
}

function Feedback({ status }: { status: CopyStatus }) {
  return (
    <span className="copy__feedback" role="status" aria-live="polite">
      {status === "copied" ? "Copied to clipboard" : status === "error" ? "Couldn’t copy. Select and copy the text." : ""}
    </span>
  );
}

interface CopyCommandProps {
  command: string;
  prompt?: string;
  copyable?: boolean;
  size?: "md" | "sm";
}

export function CopyCommand({ command, prompt, copyable = true, size = "md" }: CopyCommandProps) {
  const { status, attempt, copy } = useClipboard(command);

  return (
    <div className={cx("copy", size === "sm" && "copy--sm")} data-status={status}>
      <code>
        {prompt && <span className="copy__prompt">{prompt} </span>}
        {command}
      </code>
      {copyable && (
        <>
          <CopyButton status={status} attempt={attempt} onCopy={copy} />
          <Feedback status={status} />
        </>
      )}
    </div>
  );
}

export function CodeBlock({ label, code }: { label: string; code: string }) {
  const { status, attempt, copy } = useClipboard(code);

  return (
    <div className="copy copy--block" data-status={status}>
      <div className="copy__head">
        <span className="metaline">{label}</span>
        <CopyButton status={status} attempt={attempt} onCopy={copy} />
      </div>
      <pre>
        <code>{highlight(code)}</code>
      </pre>
      <Feedback status={status} />
    </div>
  );
}

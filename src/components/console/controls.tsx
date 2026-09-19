"use client";

import { ArrowUpRight, Check } from "@phosphor-icons/react/dist/ssr";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cn";
import { formatDuration, shorten } from "@/lib/format";
import type { RuntimeMode, TxRef } from "@/lib/runtime/types";

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">
        <span>{label}</span>
        {hint && <span>{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function PanelSection({ label, end, children }: { label?: string; end?: ReactNode; children: ReactNode }) {
  return (
    <div className="panel__section">
      {(label || end) && (
        <div className="panel__label">
          <span>{label}</span>
          {end}
        </div>
      )}
      {children}
    </div>
  );
}

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pending?: boolean;
  variant?: "default" | "primary" | "danger";
  size?: "md" | "sm";
  block?: boolean;
  icon?: ReactNode;
}

export function ActionButton({
  pending = false,
  variant = "default",
  size = "md",
  block = false,
  icon,
  children,
  className,
  disabled,
  type = "button",
  ...props
}: ActionButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "abtn",
        variant !== "default" && `abtn--${variant}`,
        size === "sm" && "abtn--sm",
        block && "abtn--block",
        !children && "abtn--icon",
        className,
      )}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...props}
    >
      {pending ? <span className="spinner" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}

export function Switch({
  label,
  checked,
  onChange,
  disabled,
  hint,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="switch" disabled={disabled} onClick={() => onChange(!checked)}>
      <span className="row__main">
        <span>{label}</span>
        {hint && <span className="row__sub">{hint}</span>}
      </span>
      <span className="switch__track" aria-hidden="true" />
    </button>
  );
}

export function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} className="check" onClick={() => onChange(!checked)}>
      <span className="check__box" aria-hidden="true">
        {checked && <Check size={12} weight="bold" />}
      </span>
      <span className="check__text">{children}</span>
    </button>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Notice({ tone, children }: { tone?: "error" | "success"; children: ReactNode }) {
  return (
    <p className={cx("notice", tone && `notice--${tone}`)} role={tone === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
}

export function Chip({ tone, children }: { tone?: "ok" | "err" | "warn"; children: ReactNode }) {
  return <span className={cx("chip", tone && `chip--${tone}`)}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

/** Transaction hash linking to the Robinhood Chain explorer; plain text for simulated transactions. */
export function TxLink({ tx, label }: { tx: TxRef; label?: string }) {
  const text = label ?? shorten(tx.hash, 6, 6);
  if (!tx.explorerUrl) {
    return (
      <span className="mono muted" title="Simulated transaction (demo mode)">
        {text}
      </span>
    );
  }
  return (
    <>
      <a className="txlink mono" href={tx.explorerUrl} target="_blank" rel="noopener noreferrer" title="View on the Robinhood Chain explorer">
        {text}
        <ArrowUpRight size={11} weight="bold" aria-hidden="true" />
      </a>
      {tx.confirmationMs !== undefined && (
        <span className="txlink__time" title="Measured from broadcast to receipt in your browser">
          {formatDuration(tx.confirmationMs)}
        </span>
      )}
    </>
  );
}

export function ModeChip({ mode }: { mode: RuntimeMode }) {
  return (
    <Chip tone={mode === "live" ? "ok" : "warn"}>
      <span className={cx("dot", mode === "demo" && "dot--warn")} aria-hidden="true" />
      {mode === "live" ? "Live" : "Demo"}
    </Chip>
  );
}

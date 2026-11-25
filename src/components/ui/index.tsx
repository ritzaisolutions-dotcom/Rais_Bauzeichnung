"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

export function Button({
  variant = "default",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      {...props}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap",
        size === "sm" ? "h-7 px-2 text-xs" : "h-8 px-3 text-sm",
        variant === "default" && "border border-line bg-panel hover:bg-paper",
        variant === "primary" && "bg-accent text-white hover:bg-orange-800",
        variant === "ghost" && "hover:bg-paper",
        variant === "danger" && "border border-red-200 bg-panel text-red-700 hover:bg-red-50",
        className,
      )}
    />
  );
}

export function IconButton({
  active,
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; label: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      {...props}
      className={clsx(
        "inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors disabled:opacity-40",
        active ? "bg-accent text-white" : "text-ink hover:bg-paper",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

const inputCls =
  "h-8 w-full rounded-md border border-line bg-panel px-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx(inputCls, props.className)} />;
}

/**
 * Number input that commits on blur/Enter, so typing "3," does not fight the store.
 * Accepts German decimal commas.
 */
export function NumberInput({
  value,
  onCommit,
  step = 0.01,
  min,
  max,
  digits = 2,
  suffix,
  className,
  ...rest
}: {
  value: number;
  onCommit: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  digits?: number;
  suffix?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const fmt = (v: number) => (Number.isFinite(v) ? v.toFixed(digits).replace(".", ",") : "");
  const [text, setText] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, digits]);
  const commit = () => {
    const v = parseFloat(text.replace(",", "."));
    if (Number.isFinite(v)) {
      let c = v;
      if (min !== undefined) c = Math.max(min, c);
      if (max !== undefined) c = Math.min(max, c);
      onCommit(c);
      setText(fmt(c));
    } else setText(fmt(value));
  };
  return (
    <div className={clsx("relative", className)}>
      <input
        {...rest}
        inputMode="decimal"
        className={clsx(inputCls, suffix && "pr-8")}
        value={text}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          commit();
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const v = parseFloat(text.replace(",", ".")) || 0;
            const n = v + (e.key === "ArrowUp" ? step : -step) * (e.shiftKey ? 10 : 1);
            onCommit(n);
            setText(fmt(n));
          }
          e.stopPropagation();
        }}
      />
      {suffix && <span className="pointer-events-none absolute right-2 top-1.5 text-xs text-muted">{suffix}</span>}
    </div>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  className,
  ...rest
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <select
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={clsx(inputCls, "pr-6", className)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          "max-h-[92vh] w-full overflow-auto rounded-xl bg-panel shadow-2xl",
          wide ? "max-w-5xl" : "max-w-lg",
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-panel px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <IconButton label="Schließen" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
        {actions}
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

export function ColorSwatches({
  colors,
  value,
  onChange,
}: {
  colors: string[];
  value?: string;
  onChange: (c: string | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        title="Standardfarbe"
        onClick={() => onChange(undefined)}
        className={clsx(
          "h-6 w-6 rounded-full border text-[10px] text-muted",
          !value ? "border-ink ring-2 ring-accent-soft" : "border-line",
        )}
      >
        A
      </button>
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          onClick={() => onChange(c)}
          className={clsx(
            "h-6 w-6 rounded-full border",
            value === c ? "border-ink ring-2 ring-accent-soft" : "border-line",
          )}
          style={{ background: c }}
        />
      ))}
      <input
        type="color"
        aria-label="Eigene Farbe"
        value={value ?? "#888888"}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-6 cursor-pointer rounded-full border border-line bg-transparent p-0"
      />
    </div>
  );
}

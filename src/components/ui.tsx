"use client";

import type { ReactNode } from "react";
import type { StageState } from "@/lib/status-display";

type IconProps = { className?: string };

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function Icon({
  className = "h-4 w-4",
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 13 4 4L19 7" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </Icon>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </Icon>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 12h12" />
    </Icon>
  );
}

export function DotIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

export function ChevronIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.2a1.5 1.5 0 0 0 1.3-.75l.6-1A1.5 1.5 0 0 1 9.9 3.5h4.2a1.5 1.5 0 0 1 1.3.75l.6 1A1.5 1.5 0 0 0 17.3 6h1.2A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-8Z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </Icon>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 16V4m0 0L8 8m4-4 4 4" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </Icon>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 12a9 9 0 0 1 15.3-6.4L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.3 6.4L3 16" />
      <path d="M3 21v-5h5" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="m6 7 1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </Icon>
  );
}

export function IdCardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <circle cx="8.5" cy="11.5" r="2" />
      <path d="M5.5 16c.7-1.4 1.7-2 3-2s2.3.6 3 2" />
      <path d="M15 10h4M15 13.5h4" />
    </Icon>
  );
}

export function FaceIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 10h.01M14.5 10h.01" />
      <path d="M8.5 14.5c.9 1.1 2 1.6 3.5 1.6s2.6-.5 3.5-1.6" />
    </Icon>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icon>
  );
}

export function ShieldCheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m12 3 7 3v5.5c0 4.4-2.9 8.2-7 9.5-4.1-1.3-7-5.1-7-9.5V6l7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </Icon>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </Icon>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20h4L20 8a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="m14 6 4 4" />
    </Icon>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cx("animate-spin", className ?? "h-4 w-4")}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** A labelled form control with an inline error message. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-red-300" id={`${id}-error`}>
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function Alert({
  tone = "error",
  children,
}: {
  tone?: "error" | "info";
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "animate-fade-up flex items-start gap-2 rounded-xl border px-3.5 py-3 text-sm",
        tone === "error"
          ? "border-red-500/30 bg-red-950/40 text-red-200"
          : "border-sky-500/30 bg-sky-950/40 text-sky-200",
      )}
    >
      <span className="mt-0.5 shrink-0">
        {tone === "error" ? <AlertIcon className="h-4 w-4" /> : <InfoIcon className="h-4 w-4" />}
      </span>
      <span>{children}</span>
    </div>
  );
}

export type StepperItem = { title: string; caption: string };

export function Stepper({
  items,
  current,
  onSelect,
}: {
  items: StepperItem[];
  current: number;
  onSelect?: (step: number) => void;
}) {
  const progress = items.length > 1 ? ((current - 1) / (items.length - 1)) * 100 : 100;

  return (
    <nav aria-label="Progress">
      <ol className="grid grid-cols-3 gap-2">
        {items.map((item, index) => {
          const step = index + 1;
          const done = step < current;
          const active = step === current;
          const canReturn = done && Boolean(onSelect);

          return (
            <li key={item.title}>
              <button
                type="button"
                disabled={!canReturn}
                onClick={canReturn ? () => onSelect?.(step) : undefined}
                aria-current={active ? "step" : undefined}
                className={cx(
                  "flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition",
                  active
                    ? "border-sky-500/60 bg-sky-500/10"
                    : done
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-slate-800 bg-slate-900/40",
                  canReturn ? "cursor-pointer hover:border-emerald-400/60" : "cursor-default",
                )}
              >
                <span
                  className={cx(
                    "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold",
                    active
                      ? "bg-sky-500 text-slate-950"
                      : done
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-slate-800 text-slate-400",
                  )}
                >
                  {done ? <CheckIcon className="h-3.5 w-3.5" /> : step}
                </span>
                <span className="min-w-0">
                  <span
                    className={cx(
                      "block truncate text-xs font-semibold",
                      active ? "text-sky-100" : done ? "text-emerald-200" : "text-slate-400",
                    )}
                  >
                    {item.title}
                  </span>
                  <span className="hidden truncate text-[11px] text-slate-500 sm:block">
                    {item.caption}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </nav>
  );
}

export function StageIcon({ state }: { state: StageState }) {
  const base = "grid h-8 w-8 shrink-0 place-items-center rounded-full ring-1";

  switch (state) {
    case "done":
      return (
        <span className={cx(base, "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30")}>
          <CheckIcon className="h-4 w-4" />
        </span>
      );
    case "failed":
      return (
        <span className={cx(base, "bg-red-500/15 text-red-300 ring-red-500/30")}>
          <CloseIcon className="h-4 w-4" />
        </span>
      );
    case "warn":
      return (
        <span className={cx(base, "bg-amber-500/15 text-amber-300 ring-amber-500/30")}>
          <AlertIcon className="h-4 w-4" />
        </span>
      );
    case "active":
      return (
        <span className={cx(base, "bg-sky-500/15 text-sky-300 ring-sky-500/30")}>
          <Spinner className="h-4 w-4" />
        </span>
      );
    case "skipped":
      return (
        <span className={cx(base, "bg-slate-800 text-slate-500 ring-slate-700")}>
          <MinusIcon className="h-4 w-4" />
        </span>
      );
    default:
      return (
        <span className={cx(base, "bg-slate-900 text-slate-600 ring-slate-800")}>
          <DotIcon className="h-3 w-3" />
        </span>
      );
  }
}

export function Disclosure({
  summary,
  hint,
  children,
  defaultOpen = false,
}: {
  summary: string;
  hint?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="group rounded-xl border border-slate-800 bg-slate-900/40" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-200 [&::-webkit-details-marker]:hidden">
        <span className="flex flex-wrap items-center gap-2">
          {summary}
          {hint && <span className="text-xs font-normal text-slate-500">{hint}</span>}
        </span>
        <ChevronIcon className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-slate-800 px-4 py-4">{children}</div>
    </details>
  );
}

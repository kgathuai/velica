"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon, CloseIcon, Spinner, TrashIcon, cx } from "@/components/ui";
import { rotateAnnotation, type Annotation, type Point } from "@/lib/image-annotations";

type Tool = "pen" | "highlight" | "text" | "redact";

const COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#ffffff",
  "#0f172a",
];

const WIDTHS = [4, 10, 20];

const TOOLS: Array<{ id: Tool; label: string }> = [
  { id: "pen", label: "Draw" },
  { id: "highlight", label: "Highlight" },
  { id: "text", label: "Text" },
  { id: "redact", label: "Black out" },
];

function Icon({ className = "h-4 w-4", children }: { className?: string; children: React.ReactNode }) {
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

const PenIcon = () => (
  <Icon>
    <path d="M4 20h4L20 8a2.8 2.8 0 0 0-4-4L4 16v4Z" />
    <path d="m14 6 4 4" />
  </Icon>
);

const HighlightIcon = () => (
  <Icon>
    <path d="M9 14 4 19l3 1 5-5" />
    <path d="M14 4l6 6-6 6-6-6 6-6Z" />
  </Icon>
);

const TextIcon = () => (
  <Icon>
    <path d="M5 6h14M12 6v13M9 19h6" />
  </Icon>
);

const RedactIcon = () => (
  <Icon>
    <rect x="3" y="7" width="18" height="10" rx="2" fill="currentColor" stroke="none" />
  </Icon>
);

const UndoIcon = () => (
  <Icon>
    <path d="M4 8h10a5 5 0 0 1 0 10H8" />
    <path d="m4 8 4-3M4 8l4 3" />
  </Icon>
);

const RedoIcon = () => (
  <Icon>
    <path d="M20 8H10a5 5 0 0 0 0 10h6" />
    <path d="m20 8-4-3M20 8l-4 3" />
  </Icon>
);

const RotateLeftIcon = () => (
  <Icon>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </Icon>
);

const RotateRightIcon = () => (
  <Icon>
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <path d="M21 4v5h-5" />
  </Icon>
);

function drawAnnotation(context: CanvasRenderingContext2D, annotation: Annotation): void {
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";

  if (annotation.kind === "pen") {
    context.globalAlpha = annotation.alpha;
    context.strokeStyle = annotation.color;
    context.fillStyle = annotation.color;
    context.lineWidth = annotation.width;

    if (annotation.points.length === 1) {
      const [point] = annotation.points;
      context.beginPath();
      context.arc(point.x, point.y, annotation.width / 2, 0, Math.PI * 2);
      context.fill();
    } else {
      context.beginPath();
      annotation.points.forEach((point, index) => {
        if (index === 0) {
          context.moveTo(point.x, point.y);
        } else {
          context.lineTo(point.x, point.y);
        }
      });
      context.stroke();
    }
  } else if (annotation.kind === "redact") {
    context.fillStyle = annotation.color;
    context.fillRect(annotation.x, annotation.y, annotation.w, annotation.h);
  } else {
    context.font = `600 ${annotation.size}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
    context.textBaseline = "top";
    // A dark outline keeps the text readable over any photo.
    context.lineWidth = Math.max(2, annotation.size / 10);
    context.strokeStyle = "rgba(0, 0, 0, 0.65)";
    context.strokeText(annotation.text, annotation.x, annotation.y);
    context.fillStyle = annotation.color;
    context.fillText(annotation.text, annotation.x, annotation.y);
  }

  context.restore();
}

export default function ImageEditor({
  title,
  source,
  onCancel,
  onSave,
}: {
  title: string;
  source: string;
  onCancel: () => void;
  onSave: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const draftRef = useRef<Annotation | null>(null);
  const frameRef = useRef<number | null>(null);

  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [pendingTextAt, setPendingTextAt] = useState<Point | null>(null);
  const [textValue, setTextValue] = useState("");

  /** Whole-list snapshots make undo/redo work uniformly for every tool. */
  const [history, setHistory] = useState<Annotation[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const annotationsRef = useRef<Annotation[]>([]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const base = baseCanvasRef.current;
    if (!canvas || !base) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(base, 0, 0, canvas.width, canvas.height);

    const all = draftRef.current
      ? [...annotationsRef.current, draftRef.current]
      : annotationsRef.current;

    for (const annotation of all) {
      drawAnnotation(context, annotation);
    }
  }, []);

  const scheduleRedraw = useCallback(() => {
    if (frameRef.current !== null) {
      return;
    }
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      redraw();
    });
  }, [redraw]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    annotationsRef.current = history[historyIndex] ?? [];
    scheduleRedraw();
  }, [history, historyIndex, scheduleRedraw]);

  // Load the capture onto an offscreen canvas at full resolution.
  useEffect(() => {
    const image = new Image();
    let cancelled = false;

    image.onload = () => {
      if (cancelled) {
        return;
      }

      const base = document.createElement("canvas");
      base.width = image.naturalWidth;
      base.height = image.naturalHeight;

      const context = base.getContext("2d");
      if (!context) {
        setError("We couldn't open that image for editing.");
        return;
      }

      context.drawImage(image, 0, 0);
      baseCanvasRef.current = base;

      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = base.width;
        canvas.height = base.height;
      }

      setReady(true);
    };

    image.onerror = () => {
      if (!cancelled) {
        setError("We couldn't load that image.");
      }
    };

    image.src = source;

    return () => {
      cancelled = true;
    };
  }, [source]);

  useEffect(() => {
    if (ready) {
      redraw();
    }
  }, [ready, redraw]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (pendingTextAt) {
          setPendingTextAt(null);
          setTextValue("");
        } else {
          onCancel();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, pendingTextAt]);

  function commit(next: Annotation[]) {
    annotationsRef.current = next;
    setHistory((previous) => [...previous.slice(0, historyIndex + 1), next]);
    setHistoryIndex(historyIndex + 1);
    scheduleRedraw();
  }

  function undo() {
    if (historyIndex === 0) {
      return;
    }
    const next = historyIndex - 1;
    setHistoryIndex(next);
    annotationsRef.current = history[next] ?? [];
    scheduleRedraw();
  }

  function redo() {
    if (historyIndex >= history.length - 1) {
      return;
    }
    const next = historyIndex + 1;
    setHistoryIndex(next);
    annotationsRef.current = history[next] ?? [];
    scheduleRedraw();
  }

  function clearAll() {
    if (annotationsRef.current.length === 0) {
      return;
    }
    commit([]);
  }

  function toCanvasPoint(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!ready) {
      return;
    }

    const point = toCanvasPoint(event);

    if (tool === "text") {
      setPendingTextAt(point);
      setTextValue("");
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === "redact") {
      draftRef.current = { kind: "redact", color, x: point.x, y: point.y, w: 0, h: 0 };
    } else {
      const isHighlight = tool === "highlight";
      draftRef.current = {
        kind: "pen",
        color,
        width: isHighlight ? width * 4 : width,
        alpha: isHighlight ? 0.35 : 1,
        points: [point],
      };
    }

    scheduleRedraw();
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const draft = draftRef.current;
    if (!draft) {
      return;
    }

    const point = toCanvasPoint(event);

    if (draft.kind === "pen") {
      draft.points.push(point);
    } else if (draft.kind === "redact") {
      draft.w = point.x - draft.x;
      draft.h = point.y - draft.y;
    }

    scheduleRedraw();
  }

  function handlePointerUp() {
    const draft = draftRef.current;
    if (!draft) {
      return;
    }
    draftRef.current = null;

    if (draft.kind === "redact") {
      const x = Math.min(draft.x, draft.x + draft.w);
      const y = Math.min(draft.y, draft.y + draft.h);
      const w = Math.abs(draft.w);
      const h = Math.abs(draft.h);

      if (w < 6 || h < 6) {
        scheduleRedraw();
        return;
      }

      commit([...annotationsRef.current, { ...draft, x, y, w, h }]);
      return;
    }

    commit([...annotationsRef.current, draft]);
  }

  function addPendingText() {
    const text = textValue.trim();
    const point = pendingTextAt;
    setPendingTextAt(null);
    setTextValue("");

    if (!text || !point) {
      return;
    }

    const canvas = canvasRef.current;
    const size = canvas ? Math.max(22, Math.round(canvas.width * 0.045)) : 32;
    commit([...annotationsRef.current, { kind: "text", color, x: point.x, y: point.y, text, size }]);
  }

  function rotate(clockwise: boolean) {
    const canvas = canvasRef.current;
    const base = baseCanvasRef.current;
    if (!canvas || !base) {
      return;
    }

    const rotated = document.createElement("canvas");
    rotated.width = base.height;
    rotated.height = base.width;

    const context = rotated.getContext("2d");
    if (!context) {
      return;
    }

    context.translate(rotated.width / 2, rotated.height / 2);
    context.rotate(clockwise ? Math.PI / 2 : -Math.PI / 2);
    context.drawImage(base, -base.width / 2, -base.height / 2);

    const remapped = annotationsRef.current.map((annotation) =>
      rotateAnnotation(annotation, base.width, base.height, clockwise),
    );

    baseCanvasRef.current = rotated;
    canvas.width = rotated.width;
    canvas.height = rotated.height;

    // Rotating re-bases the canvas, so the history starts fresh from here.
    annotationsRef.current = remapped;
    setHistory([remapped]);
    setHistoryIndex(0);
    scheduleRedraw();
  }

  function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas || !ready) {
      return;
    }

    draftRef.current = null;
    redraw();
    onSave(canvas.toDataURL("image/jpeg", 0.95));
  }

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  const hasEdits = (history[historyIndex]?.length ?? 0) > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/97 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <header className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-6">
        <div>
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            {tool === "text"
              ? "Tap the photo to place your text."
              : tool === "redact"
                ? "Drag over anything you want to black out."
                : "Draw straight on the photo."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={onCancel} className="btn btn-ghost !px-3 !py-2 text-xs">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!ready}
            className="btn btn-primary !px-3 !py-2 text-xs"
          >
            <CheckIcon className="h-4 w-4" />
            Save
          </button>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center overflow-hidden p-3 sm:p-4">
        <div className="relative">
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="max-h-[52vh] max-w-full touch-none rounded-xl border border-slate-700 bg-black sm:max-h-[58vh]"
            style={{ touchAction: "none" }}
          />
          {!ready && !error && (
            <div className="absolute inset-0 grid min-h-[200px] min-w-[240px] place-items-center rounded-xl bg-slate-900/80">
              <span className="flex items-center gap-2 text-xs text-slate-300">
                <Spinner className="h-4 w-4" />
                Loading photo…
              </span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="px-6 pb-2 text-center text-xs font-medium text-red-300" role="alert">
          {error}
        </p>
      )}

      {pendingTextAt && (
        <div className="mx-4 mb-2 flex items-center gap-2 rounded-xl border border-sky-500/40 bg-slate-900 p-2 sm:mx-6">
          <input
            autoFocus
            className="field !py-2"
            placeholder="Type your text…"
            value={textValue}
            onChange={(event) => setTextValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addPendingText();
              }
            }}
          />
          <button type="button" onClick={addPendingText} className="btn btn-primary !px-3 !py-2 text-xs">
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setPendingTextAt(null);
              setTextValue("");
            }}
            className="btn btn-ghost !px-3 !py-2 text-xs"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="border-t border-slate-800 px-3 pb-5 pt-3 sm:px-6">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {TOOLS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTool(item.id)}
              aria-pressed={tool === item.id}
              className={cx(
                "flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition",
                tool === item.id
                  ? "border-sky-500/60 bg-sky-500/15 text-sky-200"
                  : "border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800",
              )}
            >
              {item.id === "pen" && <PenIcon />}
              {item.id === "highlight" && <HighlightIcon />}
              {item.id === "text" && <TextIcon />}
              {item.id === "redact" && <RedactIcon />}
              {item.label}
            </button>
          ))}

          <span className="mx-1 h-6 w-px shrink-0 bg-slate-800" />

          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            aria-label="Undo"
            className="btn btn-secondary h-9 w-9 shrink-0 !px-0"
          >
            <UndoIcon />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            aria-label="Redo"
            className="btn btn-secondary h-9 w-9 shrink-0 !px-0"
          >
            <RedoIcon />
          </button>
          <button
            type="button"
            onClick={() => rotate(false)}
            aria-label="Rotate left"
            className="btn btn-secondary h-9 w-9 shrink-0 !px-0"
          >
            <RotateLeftIcon />
          </button>
          <button
            type="button"
            onClick={() => rotate(true)}
            aria-label="Rotate right"
            className="btn btn-secondary h-9 w-9 shrink-0 !px-0"
          >
            <RotateRightIcon />
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={!hasEdits}
            aria-label="Clear all edits"
            className="btn btn-secondary h-9 w-9 shrink-0 !px-0"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            {COLORS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setColor(value)}
                aria-label={`Colour ${value}`}
                aria-pressed={color === value}
                className={cx(
                  "h-7 w-7 rounded-full border-2 transition",
                  color === value ? "border-sky-400 scale-110" : "border-slate-600",
                )}
                style={{ backgroundColor: value }}
              />
            ))}
          </div>

          <span className="hidden h-6 w-px bg-slate-800 sm:block" />

          <div className="flex items-center gap-1.5">
            {WIDTHS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setWidth(value)}
                aria-label={`Thickness ${value}`}
                aria-pressed={width === value}
                className={cx(
                  "grid h-8 w-8 place-items-center rounded-lg border transition",
                  width === value
                    ? "border-sky-500/60 bg-sky-500/15"
                    : "border-slate-700 bg-slate-900/60 hover:bg-slate-800",
                )}
              >
                <span
                  className="rounded-full bg-slate-200"
                  style={{ width: value + 2, height: value + 2 }}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

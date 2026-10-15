"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon, CloseIcon, Spinner, TrashIcon, cx } from "@/components/ui";
import { buildBaseCanvas, drawAnnotation } from "@/lib/canvas-edits";
import {
  flipAnnotation,
  rotateAnnotation,
  type Annotation,
  type EditState,
  type Point,
} from "@/lib/image-annotations";
import { parseEditPrompt } from "@/lib/prompt-edits";

type Tool = "pen" | "highlight" | "text" | "redact" | "pixelate" | "blur";

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
  { id: "pixelate", label: "Pixelate" },
  { id: "blur", label: "Blur" },
];

const PROMPT_EXAMPLES = [
  "rotate right",
  "black out the bottom",
  "make it black and white",
  "pixelate the top right",
  'add text "COPY" at the top',
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

const PixelateIcon = () => (
  <Icon>
    <path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h6v6h-6z" fill="currentColor" stroke="none" />
  </Icon>
);

const BlurIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="8" strokeDasharray="3 3" />
    <circle cx="12" cy="12" r="4" />
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

const EMPTY_STATE: EditState = { baseOps: [], annotations: [] };

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
  const originalRef = useRef<HTMLImageElement | null>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const annotationsRef = useRef<Annotation[]>([]);
  const draftRef = useRef<Annotation | null>(null);
  const frameRef = useRef<number | null>(null);

  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [promptText, setPromptText] = useState("");
  const [promptFeedback, setPromptFeedback] = useState("");
  const [pendingTextAt, setPendingTextAt] = useState<Point | null>(null);
  const [textValue, setTextValue] = useState("");

  /**
   * History stores the *recipe* (base ops + vectors), never pixels, so undo is
   * exact and memory stays tiny. The canvas is replayed from the original.
   */
  const [history, setHistory] = useState<EditState[]>([EMPTY_STATE]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const current = history[historyIndex] ?? EMPTY_STATE;
  const currentBaseOps = current.baseOps;

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const base = baseRef.current;
    if (!canvas || !base) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(base, 0, 0);

    const all = draftRef.current
      ? [...annotationsRef.current, draftRef.current]
      : annotationsRef.current;

    for (const annotation of all) {
      drawAnnotation(context, annotation, base);
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
    annotationsRef.current = current.annotations;
    scheduleRedraw();
  }, [current, scheduleRedraw]);

  // Load the untouched original once; every render is replayed from it.
  useEffect(() => {
    const image = new Image();
    let cancelled = false;

    image.onload = () => {
      if (!cancelled) {
        originalRef.current = image;
        setReady(true);
      }
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

  // Replay the recipe whenever the geometry or adjustments change.
  useEffect(() => {
    const original = originalRef.current;
    if (!ready || !original) {
      return;
    }

    const base = buildBaseCanvas(original, currentBaseOps);
    baseRef.current = base;

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = base.width;
      canvas.height = base.height;
    }

    redraw();
  }, [ready, currentBaseOps, redraw]);

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

  function pushState(next: EditState) {
    annotationsRef.current = next.annotations;
    setHistory((previous) => [...previous.slice(0, historyIndex + 1), next]);
    setHistoryIndex(historyIndex + 1);
    scheduleRedraw();
  }

  function commitAnnotations(next: Annotation[]) {
    pushState({ baseOps: current.baseOps, annotations: next });
  }

  function undo() {
    if (historyIndex === 0) {
      return;
    }
    const next = historyIndex - 1;
    setHistoryIndex(next);
    annotationsRef.current = history[next].annotations;
    scheduleRedraw();
  }

  function redo() {
    if (historyIndex >= history.length - 1) {
      return;
    }
    const next = historyIndex + 1;
    setHistoryIndex(next);
    annotationsRef.current = history[next].annotations;
    scheduleRedraw();
  }

  function clearAll() {
    pushState(EMPTY_STATE);
    setPromptFeedback("");
  }

  function applyPrompt(rawPrompt: string) {
    const parsed = parseEditPrompt(rawPrompt);
    if (parsed.operations.length === 0) {
      setPromptFeedback(parsed.feedback ?? "I didn't understand that.");
      return;
    }

    const annotations = [...annotationsRef.current];
    const baseOps = [...current.baseOps];
    let { width, height } = baseRef.current ?? { width: 0, height: 0 };

    // Geometry first, tracking dimensions so the annotations stay aligned.
    for (const operation of parsed.operations) {
      if (operation.kind === "rotate") {
        const steps = operation.degrees === 180 ? 2 : 1;
        const clockwise = operation.degrees !== -90;
        for (let step = 0; step < steps; step += 1) {
          for (let index = 0; index < annotations.length; index += 1) {
            annotations[index] = rotateAnnotation(annotations[index], width, height, clockwise);
          }
          [width, height] = [height, width];
          baseOps.push({ kind: "rotate", clockwise });
        }
      } else if (operation.kind === "flip") {
        for (let index = 0; index < annotations.length; index += 1) {
          annotations[index] = flipAnnotation(annotations[index], width, height, operation.axis);
        }
        baseOps.push({ kind: "flip", axis: operation.axis });
      }
    }

    const minEdge = Math.max(1, Math.min(width, height));

    for (const operation of parsed.operations) {
      if (operation.kind === "adjust") {
        baseOps.push({ kind: "adjust", patch: operation.patch });
      } else if (operation.kind === "region") {
        const x = operation.area.x * width;
        const y = operation.area.y * height;
        const w = operation.area.w * width;
        const h = operation.area.h * height;

        if (operation.effect === "redact") {
          annotations.push({ kind: "redact", color: operation.color ?? "#000000", x, y, w, h });
        } else if (operation.effect === "pixelate") {
          annotations.push({
            kind: "pixelate",
            x,
            y,
            w,
            h,
            size: Math.max(8, Math.round(minEdge * 0.02)),
          });
        } else {
          annotations.push({
            kind: "blur",
            x,
            y,
            w,
            h,
            radius: Math.max(4, Math.round(minEdge * 0.012)),
          });
        }
      } else if (operation.kind === "text") {
        const area = operation.area ?? { x: 0.04, y: 0.03, w: 0.92, h: 0.1 };
        annotations.push({
          kind: "text",
          color: operation.color ?? "#ffffff",
          x: area.x * width,
          y: area.y * height,
          text: operation.text,
          size: Math.max(22, Math.round(width * 0.045)),
        });
      } else if (operation.kind === "tool") {
        setTool(operation.tool);
      }
    }

    const changed =
      baseOps.length !== current.baseOps.length ||
      annotations.length !== annotationsRef.current.length;

    if (changed) {
      pushState({ baseOps, annotations });
      setPromptText("");
    }

    setPromptFeedback(
      parsed.summary.length > 0
        ? `Applied: ${parsed.summary.join(" · ")}`
        : (parsed.feedback ?? ""),
    );
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

  function startBoxAnnotation(point: Point, activeTool: "redact" | "pixelate" | "blur"): Annotation {
    const minEdge = Math.max(
      1,
      Math.min(canvasRef.current?.width ?? 600, canvasRef.current?.height ?? 600),
    );

    if (activeTool === "redact") {
      return { kind: "redact", color, x: point.x, y: point.y, w: 0, h: 0 };
    }
    if (activeTool === "pixelate") {
      return {
        kind: "pixelate",
        x: point.x,
        y: point.y,
        w: 0,
        h: 0,
        size: Math.max(8, Math.round(minEdge * 0.02)),
      };
    }
    return {
      kind: "blur",
      x: point.x,
      y: point.y,
      w: 0,
      h: 0,
      radius: Math.max(4, Math.round(minEdge * 0.012)),
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

    if (tool === "redact" || tool === "pixelate" || tool === "blur") {
      draftRef.current = startBoxAnnotation(point, tool);
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
    } else if (draft.kind !== "text") {
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

    if (draft.kind === "pen" || draft.kind === "text") {
      commitAnnotations([...annotationsRef.current, draft]);
      return;
    }

    const x = Math.min(draft.x, draft.x + draft.w);
    const y = Math.min(draft.y, draft.y + draft.h);
    const w = Math.abs(draft.w);
    const h = Math.abs(draft.h);

    if (w < 6 || h < 6) {
      scheduleRedraw();
      return;
    }

    commitAnnotations([...annotationsRef.current, { ...draft, x, y, w, h }]);
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
    commitAnnotations([...annotationsRef.current, { kind: "text", color, x: point.x, y: point.y, text, size }]);
  }

  function rotate(clockwise: boolean) {
    const base = baseRef.current;
    if (!base) {
      return;
    }

    const annotations = annotationsRef.current.map((annotation) =>
      rotateAnnotation(annotation, base.width, base.height, clockwise),
    );

    pushState({ baseOps: [...current.baseOps, { kind: "rotate", clockwise }], annotations });
  }

  function flip(axis: "horizontal" | "vertical") {
    const base = baseRef.current;
    if (!base) {
      return;
    }

    const annotations = annotationsRef.current.map((annotation) =>
      flipAnnotation(annotation, base.width, base.height, axis),
    );

    pushState({ baseOps: [...current.baseOps, { kind: "flip", axis }], annotations });
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
  const hasEdits = current.annotations.length > 0 || current.baseOps.length > 0;

  const toolHint =
    tool === "text"
      ? "Tap the photo to place your text."
      : tool === "pen" || tool === "highlight"
        ? "Draw straight on the photo."
        : "Drag over the area you want to cover.";

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
          <p className="mt-0.5 text-xs text-slate-400">{toolHint}</p>
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
            className="max-h-[40vh] max-w-full touch-none rounded-xl border border-slate-700 bg-black sm:max-h-[48vh]"
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
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            applyPrompt(promptText);
          }}
        >
          <input
            className="field !py-2.5"
            placeholder='Describe a change — e.g. "black out the bottom"'
            value={promptText}
            aria-label="Describe a change to the image"
            onChange={(event) => setPromptText(event.target.value)}
          />
          <button
            type="submit"
            disabled={!ready || promptText.trim().length === 0}
            className="btn btn-primary shrink-0 !px-4 !py-2.5 text-xs"
          >
            Apply
          </button>
        </form>

        <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1">
          {PROMPT_EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => applyPrompt(example)}
              className="shrink-0 rounded-full border border-slate-700 bg-slate-900/60 px-2.5 py-1 text-[11px] text-slate-400 transition hover:border-sky-500/50 hover:text-sky-300"
            >
              {example}
            </button>
          ))}
        </div>

        {promptFeedback && (
          <p className="mt-1.5 text-[11px] text-sky-300" role="status">
            {promptFeedback}
          </p>
        )}

        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
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
              {item.id === "pixelate" && <PixelateIcon />}
              {item.id === "blur" && <BlurIcon />}
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
            onClick={() => flip("horizontal")}
            aria-label="Flip horizontally"
            className="btn btn-secondary h-9 shrink-0 !px-2.5 text-[11px]"
          >
            Flip
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
                  color === value ? "scale-110 border-sky-400" : "border-slate-600",
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

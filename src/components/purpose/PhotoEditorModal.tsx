import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  X,
  Check,
  Undo2,
  Trash2,
  ArrowUpRight,
  Square,
  Type,
  Pencil,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

export type ToolType = "pen" | "arrow" | "frame" | "text";

export interface Point {
  x: number; // 0..1 normalized
  y: number; // 0..1 normalized
}

export interface PathAnnotation {
  id: string;
  type: "pen";
  points: Point[];
  color: string;
  width: number;
}

export interface ArrowAnnotation {
  id: string;
  type: "arrow";
  start: Point;
  end: Point;
  color: string;
  width: number;
}

export interface FrameAnnotation {
  id: string;
  type: "frame";
  start: Point;
  end: Point;
  color: string;
  width: number;
}

export interface TextAnnotation {
  id: string;
  type: "text";
  position: Point;
  text: string;
  color: string;
  size: number;
}

export type Annotation =
  | PathAnnotation
  | ArrowAnnotation
  | FrameAnnotation
  | TextAnnotation;

export interface PhotoEditorModalProps {
  file: File | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (editedFile: File) => void;
  onSkipEdit?: (originalFile: File) => void;
}

const PALETTE = [
  { name: "Gold", hex: "#F59E0B" },
  { name: "White", hex: "#FFFFFF" },
  { name: "Cyan", hex: "#06B6D4" },
  { name: "Green", hex: "#10B981" },
  { name: "Red", hex: "#EF4444" },
  { name: "Black", hex: "#18181B" },
];

const STROKE_WIDTHS = [
  { label: "S", value: 4 },
  { label: "M", value: 8 },
  { label: "L", value: 14 },
];

export function PhotoEditorModal({
  file,
  isOpen,
  onClose,
  onSave,
  onSkipEdit,
}: PhotoEditorModalProps) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [tool, setTool] = useState<ToolType>("pen");
  const [color, setColor] = useState<string>("#F59E0B");
  const [strokeWidth, setStrokeWidth] = useState<number>(8);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Live in-place text state
  const [liveTextActive, setLiveTextActive] = useState(false);
  const [liveTextPos, setLiveTextPos] = useState<Point>({ x: 0.5, y: 0.5 });
  const [liveTextValue, setLiveTextValue] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const imgElementRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveTextInputRef = useRef<HTMLInputElement | null>(null);

  // Mutable refs for zero-latency 60fps drawing without React re-render lag
  const annotationsRef = useRef<Annotation[]>([]);
  const draftRef = useRef<Annotation | null>(null);
  const isPointerDownRef = useRef(false);
  const currentToolRef = useRef<ToolType>("pen");
  const currentColorRef = useRef<string>("#F59E0B");
  const currentStrokeWidthRef = useRef<number>(8);
  const draggingTextIdRef = useRef<string | null>(null);

  useEffect(() => {
    currentToolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    currentColorRef.current = color;
  }, [color]);

  useEffect(() => {
    currentStrokeWidthRef.current = strokeWidth;
  }, [strokeWidth]);

  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  // Read file as base64 Data URL so it is 100% reliable and never revokes unexpectedly
  useEffect(() => {
    if (!file) {
      setImgSrc(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImgSrc(reader.result as string);
    };
    reader.readAsDataURL(file);
  }, [file]);

  // Focus live text input when opened
  useEffect(() => {
    if (liveTextActive) {
      setTimeout(() => {
        liveTextInputRef.current?.focus();
      }, 50);
    }
  }, [liveTextActive]);

  // Safe rounded rect helper
  const drawRoundedRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) => {
    const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  };

  // Render a single annotation on any context
  const renderItem = (
    ctx: CanvasRenderingContext2D,
    ann: Annotation,
    w: number,
    h: number
  ) => {
    const S = Math.min(w, h) / 500;
    ctx.save();

    // Tactile 3D drop shadow
    ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
    ctx.shadowBlur = 6 * S;
    ctx.shadowOffsetX = 2 * S;
    ctx.shadowOffsetY = 3.5 * S;

    if (ann.type === "pen") {
      if (ann.points.length < 2) {
        ctx.restore();
        return;
      }
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = Math.max(2, ann.width * S * 0.8);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();
      const p0 = ann.points[0];
      ctx.moveTo(p0.x * w, p0.y * h);
      for (let i = 1; i < ann.points.length; i++) {
        const p = ann.points[i];
        ctx.lineTo(p.x * w, p.y * h);
      }
      ctx.stroke();
    } else if (ann.type === "arrow") {
      const sx = ann.start.x * w;
      const sy = ann.start.y * h;
      const ex = ann.end.x * w;
      const ey = ann.end.y * h;
      const dx = ex - sx;
      const dy = ey - sy;
      const dist = Math.hypot(dx, dy);

      if (dist < 4) {
        ctx.restore();
        return;
      }

      const angle = Math.atan2(dy, dx);
      const headLen = Math.max(16 * S, ann.width * S * 2.8);
      const headAngle = Math.PI / 6;

      const shaftEndX = ex - Math.cos(angle) * (headLen * 0.6);
      const shaftEndY = ey - Math.sin(angle) * (headLen * 0.6);

      ctx.strokeStyle = ann.color;
      ctx.lineWidth = Math.max(3, ann.width * S * 0.9);
      ctx.lineCap = "round";

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(shaftEndX, shaftEndY);
      ctx.stroke();

      // Sharp filled 3D arrowhead
      ctx.fillStyle = ann.color;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(
        ex - headLen * Math.cos(angle - headAngle),
        ey - headLen * Math.sin(angle - headAngle)
      );
      ctx.lineTo(
        ex - headLen * 0.65 * Math.cos(angle),
        ey - headLen * 0.65 * Math.sin(angle)
      );
      ctx.lineTo(
        ex - headLen * 0.7 * Math.cos(angle + headAngle),
        ey - headLen * 0.7 * Math.sin(angle + headAngle)
      );
      ctx.closePath();
      ctx.fill();
    } else if (ann.type === "frame") {
      const x1 = ann.start.x * w;
      const y1 = ann.start.y * h;
      const x2 = ann.end.x * w;
      const y2 = ann.end.y * h;

      const fx = Math.min(x1, x2);
      const fy = Math.min(y1, y2);
      const fw = Math.abs(x2 - x1);
      const fh = Math.abs(y2 - y1);

      if (fw < 5 || fh < 5) {
        ctx.restore();
        return;
      }

      ctx.strokeStyle = ann.color;
      ctx.lineWidth = Math.max(2, ann.width * S * 0.7);
      drawRoundedRect(ctx, fx, fy, fw, fh, 8 * S);
      ctx.stroke();

      // Viewfinder 3D corner brackets
      const cornerLen = Math.min(fw * 0.28, fh * 0.28, 22 * S);
      ctx.lineWidth = Math.max(3.5, ann.width * S * 1.2);

      // Top-Left
      ctx.beginPath();
      ctx.moveTo(fx, fy + cornerLen);
      ctx.lineTo(fx, fy);
      ctx.lineTo(fx + cornerLen, fy);
      ctx.stroke();

      // Top-Right
      ctx.beginPath();
      ctx.moveTo(fx + fw - cornerLen, fy);
      ctx.lineTo(fx + fw, fy);
      ctx.lineTo(fx + fw, fy + cornerLen);
      ctx.stroke();

      // Bottom-Left
      ctx.beginPath();
      ctx.moveTo(fx, fy + fh - cornerLen);
      ctx.lineTo(fx, fy + fh);
      ctx.lineTo(fx + cornerLen, fy + fh);
      ctx.stroke();

      // Bottom-Right
      ctx.beginPath();
      ctx.moveTo(fx + fw - cornerLen, fy + fh);
      ctx.lineTo(fx + fw, fy + fh);
      ctx.lineTo(fx + fw, fy + fh - cornerLen);
      ctx.stroke();
    } else if (ann.type === "text") {
      const tx = ann.position.x * w;
      const ty = ann.position.y * h;
      const fontSize = Math.max(16, ann.size * S * 2.2);

      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      const metrics = ctx.measureText(ann.text);
      const padX = 14 * S;
      const padY = 8 * S;
      const boxW = metrics.width + padX * 2;
      const boxH = fontSize + padY * 2;
      const boxX = tx - boxW / 2;
      const boxY = ty - boxH / 2;

      ctx.shadowColor = "rgba(0, 0, 0, 0.75)";
      ctx.shadowBlur = 10 * S;
      ctx.shadowOffsetX = 2 * S;
      ctx.shadowOffsetY = 5 * S;

      ctx.fillStyle = "rgba(15, 15, 20, 0.85)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = 1.5 * S;
      drawRoundedRect(ctx, boxX, boxY, boxW, boxH, 12 * S);
      ctx.fill();
      ctx.stroke();

      ctx.shadowColor = "transparent";
      ctx.fillStyle = ann.color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(ann.text, tx, ty);
    }

    ctx.restore();
  };

  // Synchronous, zero-lag canvas scene redraw
  const drawScene = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw all confirmed annotations
    for (const ann of annotationsRef.current) {
      renderItem(ctx, ann, canvas.width, canvas.height);
    }

    // Draw active live draft in real-time
    if (draftRef.current) {
      renderItem(ctx, draftRef.current, canvas.width, canvas.height);
    }
  };

  // Sync canvas dimensions directly to displayed image bounding rectangle
  const syncCanvasToImage = () => {
    const img = imgElementRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;

    const rect = img.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    canvas.width = rect.width;
    canvas.height = rect.height;
    drawScene();
  };

  // Redraw when confirmed annotations list changes
  useEffect(() => {
    drawScene();
  }, [annotations]);

  // When image loads or window resizes, match canvas size
  const handleImageLoad = () => {
    syncCanvasToImage();
  };

  useEffect(() => {
    window.addEventListener("resize", syncCanvasToImage);
    return () => window.removeEventListener("resize", syncCanvasToImage);
  }, []);

  // Compute normalized relative point (0..1)
  const getNormalizedPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { x, y };
  };

  // Real-time Pointer Down
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = getNormalizedPoint(e);
    if (!pt) return;

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    isPointerDownRef.current = true;

    // Check if dragging an existing text item
    if (currentToolRef.current === "text") {
      const clicked = [...annotationsRef.current].reverse().find((ann) => {
        if (ann.type !== "text") return false;
        const dx = Math.abs(ann.position.x - pt.x);
        const dy = Math.abs(ann.position.y - pt.y);
        return dx < 0.12 && dy < 0.08;
      });

      if (clicked) {
        draggingTextIdRef.current = clicked.id;
        return;
      }

      // If clicked empty area in text mode, start in-place text entry right there!
      setLiveTextPos(pt);
      setLiveTextValue("");
      setLiveTextActive(true);
      return;
    }

    if (currentToolRef.current === "pen") {
      draftRef.current = {
        id: `pen-${Date.now()}`,
        type: "pen",
        points: [pt],
        color: currentColorRef.current,
        width: currentStrokeWidthRef.current,
      };
      drawScene();
    } else if (currentToolRef.current === "arrow") {
      draftRef.current = {
        id: `arrow-${Date.now()}`,
        type: "arrow",
        start: pt,
        end: pt,
        color: currentColorRef.current,
        width: currentStrokeWidthRef.current,
      };
      drawScene();
    } else if (currentToolRef.current === "frame") {
      draftRef.current = {
        id: `frame-${Date.now()}`,
        type: "frame",
        start: pt,
        end: pt,
        color: currentColorRef.current,
        width: currentStrokeWidthRef.current,
      };
      drawScene();
    }
  };

  // Real-time Pointer Move: direct synchronous render, ZERO lag!
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPointerDownRef.current) return;
    const pt = getNormalizedPoint(e);
    if (!pt) return;

    if (draggingTextIdRef.current) {
      annotationsRef.current = annotationsRef.current.map((ann) =>
        ann.id === draggingTextIdRef.current && ann.type === "text"
          ? { ...ann, position: pt }
          : ann
      );
      drawScene();
      return;
    }

    if (!draftRef.current) return;

    if (draftRef.current.type === "pen") {
      draftRef.current.points.push(pt);
      drawScene();
    } else if (draftRef.current.type === "arrow") {
      draftRef.current.end = pt;
      drawScene();
    } else if (draftRef.current.type === "frame") {
      draftRef.current.end = pt;
      drawScene();
    }
  };

  // Pointer Up: commit draft
  const handlePointerUp = () => {
    isPointerDownRef.current = false;

    if (draggingTextIdRef.current) {
      draggingTextIdRef.current = null;
      setAnnotations([...annotationsRef.current]);
      return;
    }

    if (!draftRef.current) return;

    const draft = draftRef.current;
    let isValid = false;

    if (draft.type === "pen" && draft.points.length > 1) {
      isValid = true;
    } else if (draft.type === "arrow") {
      const dist = Math.hypot(draft.end.x - draft.start.x, draft.end.y - draft.start.y);
      isValid = dist > 0.02;
    } else if (draft.type === "frame") {
      const w = Math.abs(draft.end.x - draft.start.x);
      const h = Math.abs(draft.end.y - draft.start.y);
      isValid = w > 0.02 && h > 0.02;
    }

    if (isValid) {
      annotationsRef.current.push(draft);
      setAnnotations([...annotationsRef.current]);
    }

    draftRef.current = null;
    drawScene();
  };

  // Finalize live text
  const finalizeLiveText = () => {
    if (liveTextValue.trim()) {
      const newText: TextAnnotation = {
        id: `text-${Date.now()}`,
        type: "text",
        position: liveTextPos,
        text: liveTextValue.trim(),
        color,
        size: strokeWidth >= 14 ? 20 : strokeWidth >= 8 ? 16 : 13,
      };
      annotationsRef.current.push(newText);
      setAnnotations([...annotationsRef.current]);
    }
    setLiveTextActive(false);
    setLiveTextValue("");
  };

  const handleUndo = () => {
    if (annotationsRef.current.length === 0) return;
    annotationsRef.current.pop();
    setAnnotations([...annotationsRef.current]);
    drawScene();
  };

  const handleClear = () => {
    if (annotationsRef.current.length === 0) return;
    annotationsRef.current = [];
    setAnnotations([]);
    drawScene();
    toast("Annotations cleared");
  };

  // Save at 100% native resolution
  const handleSave = async () => {
    if (!file || !imgElementRef.current) return;
    setIsProcessing(true);

    try {
      const img = imgElementRef.current;
      const offscreen = document.createElement("canvas");
      offscreen.width = img.naturalWidth || img.width;
      offscreen.height = img.naturalHeight || img.height;

      const ctx = offscreen.getContext("2d");
      if (!ctx) throw new Error("Could not initialize export context");

      // Draw original base image
      ctx.drawImage(img, 0, 0, offscreen.width, offscreen.height);

      // Draw all annotations at native high-resolution scale
      for (const ann of annotationsRef.current) {
        renderItem(ctx, ann, offscreen.width, offscreen.height);
      }

      offscreen.toBlob(
        (blob) => {
          setIsProcessing(false);
          if (!blob) {
            toast.error("Failed to generate photo");
            return;
          }
          const baseName = file.name.replace(/\.[^/.]+$/, "");
          const editedFile = new File([blob], `${baseName}-3d.jpg`, {
            type: "image/jpeg",
            lastModified: Date.now(),
          });
          onSave(editedFile);
        },
        "image/jpeg",
        0.92
      );
    } catch (err: any) {
      setIsProcessing(false);
      toast.error(err?.message || "Failed to save photo");
    }
  };

  if (!isOpen || !file) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950/98 text-white select-none touch-none overflow-hidden backdrop-blur-xl animate-in fade-in duration-200">
      {/* Top 3D Header Bar */}
      <div className="relative z-20 flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-black/60 px-3 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/80 shadow-[0_2px_8px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.15)] transition-all active:scale-95 hover:bg-white/10 hover:text-white"
            title="Cancel"
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold tracking-wide text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
            <Sparkles className="h-3 w-3" />
            <span>3D PHOTO STUDIO</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {annotations.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleUndo}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/80 shadow-[0_2px_8px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.15)] transition-all active:scale-95 hover:bg-white/10 hover:text-white"
                title="Undo last stroke"
              >
                <Undo2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-rose-400 shadow-[0_2px_8px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.15)] transition-all active:scale-95 hover:bg-rose-500/20"
                title="Clear all"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}

          {onSkipEdit && annotations.length === 0 && (
            <button
              type="button"
              onClick={() => onSkipEdit(file)}
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:bg-white/10 hover:text-white active:scale-95"
            >
              Skip
            </button>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={isProcessing}
            className="flex items-center gap-1.5 rounded-xl border border-amber-400/40 bg-gradient-to-b from-amber-400 to-amber-500 px-4 py-1.5 text-xs font-bold text-zinc-950 shadow-[0_4px_16px_rgba(245,158,11,0.45),inset_0_1px_2px_rgba(255,255,255,0.5)] transition-all active:translate-y-0.5 active:scale-95 hover:brightness-110 disabled:opacity-50"
          >
            <Check className="h-4 w-4 stroke-[3]" />
            <span>{isProcessing ? "Saving..." : "Done"}</span>
          </button>
        </div>
      </div>

      {/* Main Interactive Stage */}
      <div
        ref={containerRef}
        className="relative flex flex-1 items-center justify-center p-3 overflow-hidden bg-radial from-zinc-900 to-zinc-950"
      >
        {imgSrc && (
          <div className="relative inline-block max-h-full max-w-full shadow-[0_12px_40px_rgba(0,0,0,0.9)] rounded-xl overflow-hidden border border-white/10">
            {/* The Photo Visually Displayed "Telle Quelle" */}
            <img
              ref={imgElementRef}
              src={imgSrc}
              alt="Photo preview"
              onLoad={handleImageLoad}
              className="max-h-[calc(100vh-170px)] max-w-[calc(100vw-24px)] object-contain select-none pointer-events-none block"
            />

            {/* Zero-Latency Interactive Canvas */}
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
            />

            {/* Live In-Place Text Editor Directly on Photo */}
            {liveTextActive && (
              <div
                style={{
                  left: `${liveTextPos.x * 100}%`,
                  top: `${liveTextPos.y * 100}%`,
                  transform: "translate(-50%, -50%)",
                }}
                className="absolute z-30 pointer-events-auto"
              >
                <div className="flex items-center gap-2 rounded-2xl border border-white/30 bg-black/85 px-4 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.9)] backdrop-blur-xl animate-in zoom-in-95 duration-100">
                  <input
                    ref={liveTextInputRef}
                    type="text"
                    value={liveTextValue}
                    onChange={(e) => setLiveTextValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") finalizeLiveText();
                      if (e.key === "Escape") setLiveTextActive(false);
                    }}
                    placeholder="Type caption..."
                    maxLength={80}
                    style={{ color }}
                    className="w-40 sm:w-56 bg-transparent text-center font-bold text-sm sm:text-base outline-none placeholder:text-white/40"
                  />
                  <button
                    type="button"
                    onClick={finalizeLiveText}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-400 text-black shadow-md hover:brightness-110 active:scale-95"
                  >
                    <Check className="h-4 w-4 stroke-[3]" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Tactile 3D Studio Dock */}
      <div className="relative z-20 flex shrink-0 flex-col gap-2.5 border-t border-white/10 bg-black/75 px-3 py-3 backdrop-blur-xl">
        {/* Row 1: Tools selection */}
        <div className="flex items-center justify-center gap-3">
          {/* Pen / Freehand */}
          <button
            type="button"
            onClick={() => {
              if (liveTextActive) finalizeLiveText();
              setTool("pen");
            }}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-150 ${
              tool === "pen"
                ? "bg-gradient-to-b from-amber-400 to-amber-500 text-zinc-950 shadow-[0_4px_14px_rgba(245,158,11,0.5),inset_0_1px_2px_rgba(255,255,255,0.4)] scale-105"
                : "border border-white/10 bg-white/5 text-white/70 shadow-[0_2px_6px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.1)] hover:bg-white/10 hover:text-white"
            } active:scale-95`}
          >
            <Pencil className="h-4 w-4" />
            <span>Draw</span>
          </button>

          {/* 3D Arrow */}
          <button
            type="button"
            onClick={() => {
              if (liveTextActive) finalizeLiveText();
              setTool("arrow");
            }}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-150 ${
              tool === "arrow"
                ? "bg-gradient-to-b from-amber-400 to-amber-500 text-zinc-950 shadow-[0_4px_14px_rgba(245,158,11,0.5),inset_0_1px_2px_rgba(255,255,255,0.4)] scale-105"
                : "border border-white/10 bg-white/5 text-white/70 shadow-[0_2px_6px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.1)] hover:bg-white/10 hover:text-white"
            } active:scale-95`}
          >
            <ArrowUpRight className="h-4 w-4" />
            <span>Arrow</span>
          </button>

          {/* 3D Frame */}
          <button
            type="button"
            onClick={() => {
              if (liveTextActive) finalizeLiveText();
              setTool("frame");
            }}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-150 ${
              tool === "frame"
                ? "bg-gradient-to-b from-amber-400 to-amber-500 text-zinc-950 shadow-[0_4px_14px_rgba(245,158,11,0.5),inset_0_1px_2px_rgba(255,255,255,0.4)] scale-105"
                : "border border-white/10 bg-white/5 text-white/70 shadow-[0_2px_6px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.1)] hover:bg-white/10 hover:text-white"
            } active:scale-95`}
          >
            <Square className="h-4 w-4" />
            <span>Frame</span>
          </button>

          {/* 3D Text */}
          <button
            type="button"
            onClick={() => {
              setTool("text");
              setLiveTextPos({ x: 0.5, y: 0.5 });
              setLiveTextValue("");
              setLiveTextActive(true);
            }}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-150 ${
              tool === "text"
                ? "bg-gradient-to-b from-amber-400 to-amber-500 text-zinc-950 shadow-[0_4px_14px_rgba(245,158,11,0.5),inset_0_1px_2px_rgba(255,255,255,0.4)] scale-105"
                : "border border-white/10 bg-white/5 text-white/70 shadow-[0_2px_6px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.1)] hover:bg-white/10 hover:text-white"
            } active:scale-95`}
          >
            <Type className="h-4 w-4" />
            <span>Text</span>
          </button>
        </div>

        {/* Row 2: Color Palette & Thickness */}
        <div className="flex items-center justify-between gap-2 px-1">
          {/* Swatches */}
          <div className="flex items-center gap-2">
            {PALETTE.map((c) => (
              <button
                key={c.hex}
                type="button"
                onClick={() => setColor(c.hex)}
                style={{ backgroundColor: c.hex }}
                className={`h-6 w-6 rounded-full transition-all duration-150 ${
                  color === c.hex
                    ? "scale-125 ring-2 ring-white ring-offset-2 ring-offset-black shadow-[0_0_10px_rgba(255,255,255,0.6)]"
                    : "border border-white/30 opacity-80 hover:opacity-100"
                } active:scale-95`}
                title={c.name}
              />
            ))}
          </div>

          {/* Stroke Width Toggle */}
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-0.5">
            {STROKE_WIDTHS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setStrokeWidth(s.value)}
                className={`flex h-6 w-7 items-center justify-center rounded-lg text-[11px] font-bold transition-all ${
                  strokeWidth === s.value
                    ? "bg-white/20 text-white shadow-inner"
                    : "text-white/50 hover:text-white"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
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
  Palette,
  Minus,
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
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [tool, setTool] = useState<ToolType>("pen");
  const [color, setColor] = useState<string>("#F59E0B"); // Purpose Gold default
  const [strokeWidth, setStrokeWidth] = useState<number>(8);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeDraft, setActiveDraft] = useState<Annotation | null>(null);
  const [textInputOpen, setTextInputOpen] = useState(false);
  const [textValue, setTextValue] = useState("");
  const [textTargetPoint, setTextTargetPoint] = useState<Point>({ x: 0.5, y: 0.5 });
  const [draggingTextId, setDraggingTextId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const isPointerDownRef = useRef(false);
  const dragStartPointRef = useRef<Point | null>(null);

  // Load image blob URL
  useEffect(() => {
    if (!file) {
      setImgUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setImgUrl(url);

    const img = new Image();
    img.onload = () => {
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      imgRef.current = img;
    };
    img.src = url;

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // Convert pointer event to normalized 0..1 coordinates relative to canvas
  const getNormalizedPoint = useCallback((e: React.PointerEvent<HTMLCanvasElement>): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { x, y };
  }, []);

  // Helper to draw rounded rectangle safely
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

  // Draw an annotation onto any canvas context
  const renderAnnotation = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      ann: Annotation,
      width: number,
      height: number,
      scaleMultiplier: number = 1
    ) => {
      const S = (Math.min(width, height) / 500) * scaleMultiplier;

      ctx.save();

      // Tactile 3D drop shadow
      ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
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
        ctx.moveTo(p0.x * width, p0.y * height);

        for (let i = 1; i < ann.points.length; i++) {
          const pt = ann.points[i];
          ctx.lineTo(pt.x * width, pt.y * height);
        }
        ctx.stroke();
      } else if (ann.type === "arrow") {
        const sx = ann.start.x * width;
        const sy = ann.start.y * height;
        const ex = ann.end.x * width;
        const ey = ann.end.y * height;

        const dx = ex - sx;
        const dy = ey - sy;
        const dist = Math.hypot(dx, dy);
        if (dist < 5) {
          ctx.restore();
          return;
        }

        const angle = Math.atan2(dy, dx);
        const headLen = Math.max(16 * S, ann.width * S * 2.8);
        const headAngle = Math.PI / 6;

        // Draw shaft
        const shaftEndX = ex - Math.cos(angle) * (headLen * 0.6);
        const shaftEndY = ey - Math.sin(angle) * (headLen * 0.6);

        ctx.strokeStyle = ann.color;
        ctx.lineWidth = Math.max(3, ann.width * S * 0.9);
        ctx.lineCap = "round";

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(shaftEndX, shaftEndY);
        ctx.stroke();

        // Draw 3D arrowhead
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
        const x1 = ann.start.x * width;
        const y1 = ann.start.y * height;
        const x2 = ann.end.x * width;
        const y2 = ann.end.y * height;

        const fx = Math.min(x1, x2);
        const fy = Math.min(y1, y2);
        const fw = Math.abs(x2 - x1);
        const fh = Math.abs(y2 - y1);

        if (fw < 6 || fh < 6) {
          ctx.restore();
          return;
        }

        // Main frame box with tactile stroke
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = Math.max(2, ann.width * S * 0.7);
        drawRoundedRect(ctx, fx, fy, fw, fh, 8 * S);
        ctx.stroke();

        // 3D Corner brackets (viewfinder target feel)
        const cornerLen = Math.min(fw * 0.28, fh * 0.28, 22 * S);
        ctx.lineWidth = Math.max(3.5, ann.width * S * 1.2);

        // Top-left
        ctx.beginPath();
        ctx.moveTo(fx, fy + cornerLen);
        ctx.lineTo(fx, fy);
        ctx.lineTo(fx + cornerLen, fy);
        ctx.stroke();

        // Top-right
        ctx.beginPath();
        ctx.moveTo(fx + fw - cornerLen, fy);
        ctx.lineTo(fx + fw, fy);
        ctx.lineTo(fx + fw, fy + cornerLen);
        ctx.stroke();

        // Bottom-left
        ctx.beginPath();
        ctx.moveTo(fx, fy + fh - cornerLen);
        ctx.lineTo(fx, fy + fh);
        ctx.lineTo(fx + cornerLen, fy + fh);
        ctx.stroke();

        // Bottom-right
        ctx.beginPath();
        ctx.moveTo(fx + fw - cornerLen, fy + fh);
        ctx.lineTo(fx + fw, fy + fh);
        ctx.lineTo(fx + fw, fy + fh - cornerLen);
        ctx.stroke();
      } else if (ann.type === "text") {
        const tx = ann.position.x * width;
        const ty = ann.position.y * height;
        const fontSize = Math.max(16, ann.size * S * 2.2);

        ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        const metrics = ctx.measureText(ann.text);
        const padX = 14 * S;
        const padY = 8 * S;
        const boxW = metrics.width + padX * 2;
        const boxH = fontSize + padY * 2;
        const boxX = tx - boxW / 2;
        const boxY = ty - boxH / 2;

        // 3D Frosted dark pill badge
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

        // Text with crisp color
        ctx.shadowColor = "transparent";
        ctx.fillStyle = ann.color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(ann.text, tx, ty);
      }

      ctx.restore();
    },
    []
  );

  // Redraw preview canvas
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw all confirmed annotations
    for (const ann of annotations) {
      renderAnnotation(ctx, ann, canvas.width, canvas.height, 1);
    }

    // Draw active draft
    if (activeDraft) {
      renderAnnotation(ctx, activeDraft, canvas.width, canvas.height, 1);
    }
  }, [annotations, activeDraft, renderAnnotation]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // Adjust canvas size to match image layout
  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || naturalSize.w === 0 || naturalSize.h === 0) return;

    const contRect = container.getBoundingClientRect();
    const contW = contRect.width - 24;
    const contH = contRect.height - 24;

    const imgAspect = naturalSize.w / naturalSize.h;
    const contAspect = contW / contH;

    let displayW = 0;
    let displayH = 0;

    if (imgAspect > contAspect) {
      displayW = contW;
      displayH = contW / imgAspect;
    } else {
      displayH = contH;
      displayW = contH * imgAspect;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
    canvas.style.width = `${displayW}px`;
    canvas.style.height = `${displayH}px`;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
    }
    redraw();
  }, [naturalSize, redraw]);

  useEffect(() => {
    syncCanvasSize();
    window.addEventListener("resize", syncCanvasSize);
    return () => window.removeEventListener("resize", syncCanvasSize);
  }, [syncCanvasSize]);

  // Handle pointer down (mouse or finger)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = getNormalizedPoint(e);
    if (!pt) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    isPointerDownRef.current = true;
    dragStartPointRef.current = pt;

    // Check if user tapped near an existing text item to drag it
    if (tool === "text") {
      const clickedText = [...annotations].reverse().find((ann) => {
        if (ann.type !== "text") return false;
        const dx = Math.abs(ann.position.x - pt.x);
        const dy = Math.abs(ann.position.y - pt.y);
        return dx < 0.12 && dy < 0.08;
      });

      if (clickedText) {
        setDraggingTextId(clickedText.id);
        return;
      }
    }

    if (tool === "pen") {
      setActiveDraft({
        id: `pen-${Date.now()}`,
        type: "pen",
        points: [pt],
        color,
        width: strokeWidth,
      });
    } else if (tool === "arrow") {
      setActiveDraft({
        id: `arrow-${Date.now()}`,
        type: "arrow",
        start: pt,
        end: pt,
        color,
        width: strokeWidth,
      });
    } else if (tool === "frame") {
      setActiveDraft({
        id: `frame-${Date.now()}`,
        type: "frame",
        start: pt,
        end: pt,
        color,
        width: strokeWidth,
      });
    } else if (tool === "text") {
      // Open text prompt at this point
      setTextTargetPoint(pt);
      setTextValue("");
      setTextInputOpen(true);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPointerDownRef.current) return;
    const pt = getNormalizedPoint(e);
    if (!pt) return;

    if (draggingTextId) {
      setAnnotations((prev) =>
        prev.map((ann) =>
          ann.id === draggingTextId && ann.type === "text"
            ? { ...ann, position: pt }
            : ann
        )
      );
      return;
    }

    if (!activeDraft) return;

    if (activeDraft.type === "pen") {
      setActiveDraft((prev) => {
        if (!prev || prev.type !== "pen") return prev;
        return {
          ...prev,
          points: [...prev.points, pt],
        };
      });
    } else if (activeDraft.type === "arrow") {
      setActiveDraft((prev) => {
        if (!prev || prev.type !== "arrow") return prev;
        return {
          ...prev,
          end: pt,
        };
      });
    } else if (activeDraft.type === "frame") {
      setActiveDraft((prev) => {
        if (!prev || prev.type !== "frame") return prev;
        return {
          ...prev,
          end: pt,
        };
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isPointerDownRef.current = false;
    dragStartPointRef.current = null;

    if (draggingTextId) {
      setDraggingTextId(null);
      return;
    }

    if (!activeDraft) return;

    // Validate draft before saving
    let isValid = false;
    if (activeDraft.type === "pen" && activeDraft.points.length > 1) {
      isValid = true;
    } else if (activeDraft.type === "arrow") {
      const dist = Math.hypot(
        activeDraft.end.x - activeDraft.start.x,
        activeDraft.end.y - activeDraft.start.y
      );
      isValid = dist > 0.02;
    } else if (activeDraft.type === "frame") {
      const w = Math.abs(activeDraft.end.x - activeDraft.start.x);
      const h = Math.abs(activeDraft.end.y - activeDraft.start.y);
      isValid = w > 0.02 && h > 0.02;
    }

    if (isValid) {
      setAnnotations((prev) => [...prev, activeDraft]);
    }

    setActiveDraft(null);
  };

  // Add text annotation
  const handleConfirmText = () => {
    if (!textValue.trim()) {
      setTextInputOpen(false);
      return;
    }

    const newText: TextAnnotation = {
      id: `text-${Date.now()}`,
      type: "text",
      position: textTargetPoint,
      text: textValue.trim(),
      color,
      size: strokeWidth >= 14 ? 20 : strokeWidth >= 8 ? 16 : 13,
    };

    setAnnotations((prev) => [...prev, newText]);
    setTextValue("");
    setTextInputOpen(false);
  };

  const handleUndo = () => {
    setAnnotations((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (annotations.length === 0) return;
    setAnnotations([]);
    toast("All annotations cleared");
  };

  // Full native resolution export
  const handleSave = async () => {
    if (!file || !imgRef.current) return;
    setIsProcessing(true);

    try {
      const img = imgRef.current;
      const offscreen = document.createElement("canvas");
      offscreen.width = img.naturalWidth;
      offscreen.height = img.naturalHeight;

      const ctx = offscreen.getContext("2d");
      if (!ctx) throw new Error("Could not initialize canvas context");

      // Draw original image at 100% native resolution
      ctx.drawImage(img, 0, 0);

      // Render annotations at full scale
      for (const ann of annotations) {
        renderAnnotation(ctx, ann, offscreen.width, offscreen.height, 1);
      }

      // Export as high-quality JPEG
      offscreen.toBlob(
        (blob) => {
          setIsProcessing(false);
          if (!blob) {
            toast.error("Failed to generate edited photo");
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
      <div className="relative z-10 flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-black/60 px-3 backdrop-blur-md">
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
        {imgUrl && (
          <div className="relative inline-block max-h-full max-w-full shadow-[0_12px_40px_rgba(0,0,0,0.9)] rounded-lg overflow-hidden border border-white/10">
            {/* Base Image */}
            <img
              src={imgUrl}
              alt="Photo preview"
              className="max-h-[calc(100vh-170px)] max-w-[calc(100vw-24px)] object-contain select-none pointer-events-none block"
            />

            {/* Interactive Drawing Canvas */}
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
            />
          </div>
        )}
      </div>

      {/* Bottom Tactile 3D Studio Dock */}
      <div className="relative z-10 flex shrink-0 flex-col gap-2.5 border-t border-white/10 bg-black/75 px-3 py-3 backdrop-blur-xl">
        {/* Row 1: Tools selection */}
        <div className="flex items-center justify-center gap-3">
          {/* Pen / Freehand */}
          <button
            type="button"
            onClick={() => setTool("pen")}
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
            onClick={() => setTool("arrow")}
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
            onClick={() => setTool("frame")}
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
            onClick={() => setTool("text")}
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

      {/* Text Input Modal Popup */}
      {textInputOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-2xl border border-white/20 bg-zinc-900/95 p-5 shadow-[0_16px_50px_rgba(0,0,0,0.9)] animate-in zoom-in-95 duration-150">
            <h3 className="mb-2 text-sm font-semibold tracking-wide text-white">
              Add 3D Text Label
            </h3>
            <input
              type="text"
              autoFocus
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConfirmText();
                if (e.key === "Escape") setTextInputOpen(false);
              }}
              placeholder="Type your caption..."
              maxLength={80}
              className="w-full rounded-xl border border-white/15 bg-black/50 px-3.5 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setTextInputOpen(false)}
                className="rounded-xl border border-white/10 px-3.5 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmText}
                className="rounded-xl border border-amber-400/40 bg-gradient-to-b from-amber-400 to-amber-500 px-4 py-1.5 text-xs font-bold text-zinc-950 shadow-[0_2px_10px_rgba(245,158,11,0.4)] hover:brightness-110 active:scale-95"
              >
                Place Text
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
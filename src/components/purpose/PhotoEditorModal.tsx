import React, { useEffect, useRef, useState } from "react";
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
  MousePointer2,
  RotateCw,
  Copy,
} from "lucide-react";
import { toast } from "sonner";

export type ToolType = "select" | "pen" | "arrow" | "frame" | "text";

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
  x: number; // center x (0..1)
  y: number; // center y (0..1)
  width: number; // 0..1
  height: number; // 0..1
  rotation: number; // radians
  color: string;
  strokeWidth: number;
}

export interface TextAnnotation {
  id: string;
  type: "text";
  position: Point; // center (0..1)
  text: string;
  color: string;
  size: number;
  rotation: number; // radians
  scale: number;
}

export type Annotation =
  | PathAnnotation
  | ArrowAnnotation
  | FrameAnnotation
  | TextAnnotation;

export interface PhotoEditorModalProps {
  file: File | null;
  isOpen?: boolean;
  open?: boolean;
  onClose: () => void;
  onSave: (editedFile: File) => void;
  onSkipEdit?: (originalFile: File) => void;
  onSkip?: (originalFile: File) => void;
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
  open,
  onClose,
  onSave,
  onSkipEdit,
  onSkip,
}: PhotoEditorModalProps) {
  const activeOpen = Boolean(isOpen ?? open);
  const handleSkip = onSkipEdit || onSkip;
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [tool, setTool] = useState<ToolType>("frame");
  const [color, setColor] = useState<string>("#F59E0B");
  const [strokeWidth, setStrokeWidth] = useState<number>(8);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Live in-place text state
  const [liveTextActive, setLiveTextActive] = useState(false);
  const [liveTextPos, setLiveTextPos] = useState<Point>({ x: 0.5, y: 0.5 });
  const [liveTextValue, setLiveTextValue] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const imgElementRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveTextInputRef = useRef<HTMLInputElement | null>(null);

  // Mutable refs for zero-latency 60fps interaction without React re-render lag
  const annotationsRef = useRef<Annotation[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  const draftRef = useRef<Annotation | null>(null);
  const currentToolRef = useRef<ToolType>("frame");
  const currentColorRef = useRef<string>("#F59E0B");
  const currentStrokeWidthRef = useRef<number>(8);

  // Touch & pointer interaction tracking
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const interactionRef = useRef<{
    mode: "none" | "draw" | "drag" | "scale" | "rotate" | "pinch";
    targetId?: string;
    corner?: "tl" | "tr" | "br" | "bl" | "start" | "end";
    startPointer?: Point;
    startAnnState?: Annotation;
    startDistance?: number;
    startAngle?: number;
    startCenter?: Point;
  }>({ mode: "none" });

  useEffect(() => {
    currentToolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    currentColorRef.current = color;
    // Update selected annotation color if one is selected
    if (selectedIdRef.current) {
      setAnnotations((prev) =>
        prev.map((ann) =>
          ann.id === selectedIdRef.current ? ({ ...ann, color } as Annotation) : ann
        )
      );
    }
  }, [color]);

  useEffect(() => {
    currentStrokeWidthRef.current = strokeWidth;
    // Update selected annotation width if one is selected
    if (selectedIdRef.current) {
      setAnnotations((prev) =>
        prev.map((ann) => {
          if (ann.id !== selectedIdRef.current) return ann;
          if (ann.type === "pen" || ann.type === "arrow") {
            return { ...ann, width: strokeWidth };
          }
          if (ann.type === "frame") {
            return { ...ann, strokeWidth };
          }
          if (ann.type === "text") {
            return { ...ann, size: strokeWidth >= 14 ? 20 : strokeWidth >= 8 ? 16 : 13 };
          }
          return ann;
        })
      );
    }
  }, [strokeWidth]);

  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    drawScene();
  }, [selectedId]);

  // Read file as base64 Data URL so it is 100% reliable
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
    h: number,
    skipShadow = false
  ) => {
    const S = Math.min(w, h) / 500;
    ctx.save();

    if (!skipShadow) {
      ctx.shadowColor = "rgba(0, 0, 0, 0.75)";
      ctx.shadowBlur = 6 * S;
      ctx.shadowOffsetX = 2 * S;
      ctx.shadowOffsetY = 3.5 * S;
    }

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
      const cx = ann.x * w;
      const cy = ann.y * h;
      const fw = ann.width * w;
      const fh = ann.height * h;

      if (fw < 4 || fh < 4) {
        ctx.restore();
        return;
      }

      ctx.translate(cx, cy);
      if (ann.rotation) {
        ctx.rotate(ann.rotation);
      }

      const fx = -fw / 2;
      const fy = -fh / 2;

      ctx.strokeStyle = ann.color;
      ctx.lineWidth = Math.max(2, ann.strokeWidth * S * 0.7);
      drawRoundedRect(ctx, fx, fy, fw, fh, 8 * S);
      ctx.stroke();

      // Viewfinder 3D corner brackets
      const cornerLen = Math.min(fw * 0.28, fh * 0.28, 22 * S);
      ctx.lineWidth = Math.max(3.5, ann.strokeWidth * S * 1.2);

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
      const fontSize = Math.max(16, ann.size * S * 2.2 * (ann.scale || 1));

      ctx.translate(tx, ty);
      if (ann.rotation) {
        ctx.rotate(ann.rotation);
      }

      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      const metrics = ctx.measureText(ann.text);
      const padX = 14 * S;
      const padY = 8 * S;
      const boxW = metrics.width + padX * 2;
      const boxH = fontSize + padY * 2;
      const boxX = -boxW / 2;
      const boxY = -boxH / 2;

      ctx.shadowColor = "rgba(0, 0, 0, 0.75)";
      ctx.shadowBlur = 10 * S;
      ctx.shadowOffsetX = 2 * S;
      ctx.shadowOffsetY = 5 * S;

      ctx.fillStyle = "rgba(15, 15, 20, 0.88)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = 1.5 * S;
      drawRoundedRect(ctx, boxX, boxY, boxW, boxH, 12 * S);
      ctx.fill();
      ctx.stroke();

      ctx.shadowColor = "transparent";
      ctx.fillStyle = ann.color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(ann.text, 0, 0);
    }

    ctx.restore();
  };

  // Draw selection box, handles & rotation stem around selected item
  const renderSelection = (
    ctx: CanvasRenderingContext2D,
    ann: Annotation,
    w: number,
    h: number
  ) => {
    ctx.save();
    const S = Math.min(w, h) / 500;

    const drawHandle = (hx: number, hy: number, isRotation = false) => {
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
      ctx.shadowBlur = 6 * S;
      ctx.shadowOffsetX = 1 * S;
      ctx.shadowOffsetY = 2 * S;

      ctx.fillStyle = isRotation ? "#06B6D4" : "#F59E0B";
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 2 * S;
      ctx.beginPath();
      ctx.arc(hx, hy, (isRotation ? 9 : 8) * S, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    if (ann.type === "frame") {
      const cx = ann.x * w;
      const cy = ann.y * h;
      const fw = ann.width * w;
      const fh = ann.height * h;

      ctx.translate(cx, cy);
      if (ann.rotation) ctx.rotate(ann.rotation);

      const hw = fw / 2 + 10 * S;
      const hh = fh / 2 + 10 * S;

      // Dashed outer ring
      ctx.strokeStyle = "rgba(245, 158, 11, 0.9)";
      ctx.lineWidth = 1.8 * S;
      ctx.setLineDash([6 * S, 4 * S]);
      ctx.strokeRect(-hw, -hh, hw * 2, hh * 2);
      ctx.setLineDash([]);

      // Rotation stem & handle
      const stemLen = 30 * S;
      ctx.strokeStyle = "rgba(6, 182, 212, 0.85)";
      ctx.lineWidth = 2 * S;
      ctx.beginPath();
      ctx.moveTo(0, -hh);
      ctx.lineTo(0, -hh - stemLen);
      ctx.stroke();

      drawHandle(0, -hh - stemLen, true);

      // Corner handles for resizing
      drawHandle(-hw, -hh);
      drawHandle(hw, -hh);
      drawHandle(hw, hh);
      drawHandle(-hw, hh);
    } else if (ann.type === "arrow") {
      const sx = ann.start.x * w;
      const sy = ann.start.y * h;
      const ex = ann.end.x * w;
      const ey = ann.end.y * h;

      // Handles on start (tail) and end (head)
      drawHandle(sx, sy);
      drawHandle(ex, ey);

      // Center rotation handle
      const cx = (sx + ex) / 2;
      const cy = (sy + ey) / 2;
      const dx = ex - sx;
      const dy = ey - sy;
      const angle = Math.atan2(dy, dx);
      const perpAngle = angle - Math.PI / 2;
      const stemLen = 28 * S;
      const rx = cx + Math.cos(perpAngle) * stemLen;
      const ry = cy + Math.sin(perpAngle) * stemLen;

      ctx.strokeStyle = "rgba(6, 182, 212, 0.85)";
      ctx.lineWidth = 2 * S;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(rx, ry);
      ctx.stroke();

      drawHandle(rx, ry, true);
    } else if (ann.type === "text") {
      const tx = ann.position.x * w;
      const ty = ann.position.y * h;
      const fontSize = Math.max(16, ann.size * S * 2.2 * (ann.scale || 1));

      ctx.translate(tx, ty);
      if (ann.rotation) ctx.rotate(ann.rotation);

      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      const metrics = ctx.measureText(ann.text);
      const padX = 14 * S;
      const padY = 8 * S;
      const boxW = metrics.width + padX * 2;
      const boxH = fontSize + padY * 2;
      const hw = boxW / 2 + 8 * S;
      const hh = boxH / 2 + 8 * S;

      ctx.strokeStyle = "rgba(245, 158, 11, 0.9)";
      ctx.lineWidth = 1.8 * S;
      ctx.setLineDash([6 * S, 4 * S]);
      ctx.strokeRect(-hw, -hh, hw * 2, hh * 2);
      ctx.setLineDash([]);

      // Rotation stem & handle
      const stemLen = 28 * S;
      ctx.strokeStyle = "rgba(6, 182, 212, 0.85)";
      ctx.lineWidth = 2 * S;
      ctx.beginPath();
      ctx.moveTo(0, -hh);
      ctx.lineTo(0, -hh - stemLen);
      ctx.stroke();

      drawHandle(0, -hh - stemLen, true);
      drawHandle(-hw, -hh);
      drawHandle(hw, -hh);
      drawHandle(hw, hh);
      drawHandle(-hw, hh);
    } else if (ann.type === "pen") {
      // Find bounding box of pen stroke
      let minX = 1,
        maxX = 0,
        minY = 1,
        maxY = 0;
      for (const p of ann.points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      const bx = minX * w - 8 * S;
      const by = minY * h - 8 * S;
      const bw = (maxX - minX) * w + 16 * S;
      const bh = (maxY - minY) * h + 16 * S;

      ctx.strokeStyle = "rgba(245, 158, 11, 0.9)";
      ctx.lineWidth = 1.8 * S;
      ctx.setLineDash([6 * S, 4 * S]);
      ctx.strokeRect(bx, by, bw, bh);
      ctx.setLineDash([]);

      drawHandle(bx, by);
      drawHandle(bx + bw, by);
      drawHandle(bx + bw, by + bh);
      drawHandle(bx, by + bh);
    }

    ctx.restore();
  };

  // Synchronous canvas scene redraw
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

    // Draw selection handles on selected item
    if (selectedIdRef.current) {
      const selected = annotationsRef.current.find(
        (a) => a.id === selectedIdRef.current
      );
      if (selected) {
        renderSelection(ctx, selected, canvas.width, canvas.height);
      }
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

  useEffect(() => {
    drawScene();
  }, [annotations]);

  const handleImageLoad = () => {
    syncCanvasToImage();
  };

  useEffect(() => {
    window.addEventListener("resize", syncCanvasToImage);
    return () => window.removeEventListener("resize", syncCanvasToImage);
  }, []);

  // Compute normalized relative point (0..1)
  const getNormalizedPoint = (
    clientX: number,
    clientY: number
  ): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return { x, y };
  };

  // Get pixel distance from point to segment
  const distToSegment = (
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ) => {
    const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
  };

  // Hit-test on annotation body
  const hitTestAnnotation = (ann: Annotation, pt: Point): boolean => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const w = canvas.width;
    const h = canvas.height;
    const px = pt.x * w;
    const py = pt.y * h;

    if (ann.type === "frame") {
      const cx = ann.x * w;
      const cy = ann.y * h;
      const dx = px - cx;
      const dy = py - cy;
      const rot = ann.rotation || 0;
      const lx = dx * Math.cos(-rot) - dy * Math.sin(-rot);
      const ly = dx * Math.sin(-rot) + dy * Math.cos(-rot);
      const hw = (ann.width * w) / 2 + 15;
      const hh = (ann.height * h) / 2 + 15;
      return Math.abs(lx) <= hw && Math.abs(ly) <= hh;
    } else if (ann.type === "arrow") {
      const sx = ann.start.x * w;
      const sy = ann.start.y * h;
      const ex = ann.end.x * w;
      const ey = ann.end.y * h;
      return distToSegment(px, py, sx, sy, ex, ey) < 28;
    } else if (ann.type === "text") {
      const tx = ann.position.x * w;
      const ty = ann.position.y * h;
      const dx = px - tx;
      const dy = py - ty;
      const rot = ann.rotation || 0;
      const lx = dx * Math.cos(-rot) - dy * Math.sin(-rot);
      const ly = dx * Math.sin(-rot) + dy * Math.cos(-rot);
      const S = Math.min(w, h) / 500;
      const fontSize = Math.max(16, ann.size * S * 2.2 * (ann.scale || 1));
      const boxW = (ann.text.length * fontSize * 0.65 + 32 * S);
      const boxH = fontSize + 24 * S;
      return Math.abs(lx) <= boxW / 2 + 10 && Math.abs(ly) <= boxH / 2 + 10;
    } else if (ann.type === "pen") {
      for (let i = 0; i < ann.points.length - 1; i++) {
        const p1 = ann.points[i];
        const p2 = ann.points[i + 1];
        if (
          distToSegment(px, py, p1.x * w, p1.y * h, p2.x * w, p2.y * h) < 24
        ) {
          return true;
        }
      }
    }
    return false;
  };

  // Hit-test on handles of selected annotation
  const hitTestHandles = (
    ann: Annotation,
    pt: Point
  ): {
    mode: "scale" | "rotate";
    corner?: "tl" | "tr" | "br" | "bl" | "start" | "end";
  } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const w = canvas.width;
    const h = canvas.height;
    const px = pt.x * w;
    const py = pt.y * h;
    const S = Math.min(w, h) / 500;
    const hitRadius = 26 * S;

    if (ann.type === "frame" || ann.type === "text") {
      let cx = 0,
        cy = 0,
        hw = 0,
        hh = 0,
        rot = 0;
      if (ann.type === "frame") {
        cx = ann.x * w;
        cy = ann.y * h;
        hw = (ann.width * w) / 2 + 10 * S;
        hh = (ann.height * h) / 2 + 10 * S;
        rot = ann.rotation || 0;
      } else {
        cx = ann.position.x * w;
        cy = ann.position.y * h;
        const fontSize = Math.max(16, ann.size * S * 2.2 * (ann.scale || 1));
        const boxW = ann.text.length * fontSize * 0.65 + 32 * S;
        const boxH = fontSize + 24 * S;
        hw = boxW / 2 + 8 * S;
        hh = boxH / 2 + 8 * S;
        rot = ann.rotation || 0;
      }

      // Check rotation handle (located at (0, -hh - 30*S) in local coords)
      const dx = px - cx;
      const dy = py - cy;
      const lx = dx * Math.cos(-rot) - dy * Math.sin(-rot);
      const ly = dx * Math.sin(-rot) + dy * Math.cos(-rot);

      const rotY = -hh - 30 * S;
      if (Math.hypot(lx, ly - rotY) <= hitRadius) {
        return { mode: "rotate" };
      }

      // Check 4 corners
      if (Math.hypot(lx - -hw, ly - -hh) <= hitRadius) {
        return { mode: "scale", corner: "tl" };
      }
      if (Math.hypot(lx - hw, ly - -hh) <= hitRadius) {
        return { mode: "scale", corner: "tr" };
      }
      if (Math.hypot(lx - hw, ly - hh) <= hitRadius) {
        return { mode: "scale", corner: "br" };
      }
      if (Math.hypot(lx - -hw, ly - hh) <= hitRadius) {
        return { mode: "scale", corner: "bl" };
      }
    } else if (ann.type === "arrow") {
      const sx = ann.start.x * w;
      const sy = ann.start.y * h;
      const ex = ann.end.x * w;
      const ey = ann.end.y * h;

      if (Math.hypot(px - sx, py - sy) <= hitRadius) {
        return { mode: "scale", corner: "start" };
      }
      if (Math.hypot(px - ex, py - ey) <= hitRadius) {
        return { mode: "scale", corner: "end" };
      }

      const cx = (sx + ex) / 2;
      const cy = (sy + ey) / 2;
      const angle = Math.atan2(ey - sy, ex - sx);
      const perpAngle = angle - Math.PI / 2;
      const stemLen = 28 * S;
      const rx = cx + Math.cos(perpAngle) * stemLen;
      const ry = cy + Math.sin(perpAngle) * stemLen;
      if (Math.hypot(px - rx, py - ry) <= hitRadius) {
        return { mode: "rotate" };
      }
    }

    return null;
  };

  // Pointer Down Handler
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = getNormalizedPoint(e.clientX, e.clientY);
    if (!pt) return;

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    activePointersRef.current.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
    });

    // Check if 2 pointers are down -> Pinch & Rotate mode
    if (activePointersRef.current.size === 2 && selectedIdRef.current) {
      const pts = Array.from(activePointersRef.current.values()) as { x: number; y: number }[];
      const p1 = pts[0];
      const p2 = pts[1];
      const selected = annotationsRef.current.find(
        (a) => a.id === selectedIdRef.current
      );
      if (selected) {
        interactionRef.current = {
          mode: "pinch",
          targetId: selected.id,
          startAnnState: JSON.parse(JSON.stringify(selected)),
          startDistance: Math.hypot(p2.x - p1.x, p2.y - p1.y),
          startAngle: Math.atan2(p2.y - p1.y, p2.x - p1.x),
          startCenter: {
            x: (p1.x + p2.x) / 2,
            y: (p1.y + p2.y) / 2,
          },
        };
        return;
      }
    }

    // 1. Check if user clicked on handles of currently selected object
    if (selectedIdRef.current) {
      const selected = annotationsRef.current.find(
        (a) => a.id === selectedIdRef.current
      );
      if (selected) {
        const handleHit = hitTestHandles(selected, pt);
        if (handleHit) {
          interactionRef.current = {
            mode: handleHit.mode,
            targetId: selected.id,
            corner: handleHit.corner,
            startPointer: pt,
            startAnnState: JSON.parse(JSON.stringify(selected)),
          };
          return;
        }
      }
    }

    // 2. Check if user clicked on any existing annotation to select/drag it
    const clickedItem = [...annotationsRef.current]
      .reverse()
      .find((ann) => hitTestAnnotation(ann, pt));

    if (clickedItem) {
      setSelectedId(clickedItem.id);
      selectedIdRef.current = clickedItem.id;
      interactionRef.current = {
        mode: "drag",
        targetId: clickedItem.id,
        startPointer: pt,
        startAnnState: JSON.parse(JSON.stringify(clickedItem)),
      };
      drawScene();
      return;
    }

    // 3. User clicked empty space:
    // If tool is 'select', deselect
    if (currentToolRef.current === "select") {
      setSelectedId(null);
      selectedIdRef.current = null;
      interactionRef.current = { mode: "none" };
      drawScene();
      return;
    }

    // If tool is 'text', start in-place text entry right there
    if (currentToolRef.current === "text") {
      setSelectedId(null);
      selectedIdRef.current = null;
      setLiveTextPos(pt);
      setLiveTextValue("");
      setLiveTextActive(true);
      interactionRef.current = { mode: "none" };
      return;
    }

    // Otherwise deselect and start drawing new shape
    setSelectedId(null);
    selectedIdRef.current = null;

    if (currentToolRef.current === "pen") {
      draftRef.current = {
        id: `pen-${Date.now()}`,
        type: "pen",
        points: [pt],
        color: currentColorRef.current,
        width: currentStrokeWidthRef.current,
      };
      interactionRef.current = { mode: "draw" };
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
      interactionRef.current = { mode: "draw" };
      drawScene();
    } else if (currentToolRef.current === "frame") {
      draftRef.current = {
        id: `frame-${Date.now()}`,
        type: "frame",
        x: pt.x,
        y: pt.y,
        width: 0.01,
        height: 0.01,
        rotation: 0,
        color: currentColorRef.current,
        strokeWidth: currentStrokeWidthRef.current,
      };
      interactionRef.current = {
        mode: "draw",
        startPointer: pt,
      };
      drawScene();
    }
  };

  // Pointer Move Handler
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
    });

    const inter = interactionRef.current;
    if (inter.mode === "none") return;

    // Handle 2-finger Pinch & Rotate
    if (inter.mode === "pinch" && activePointersRef.current.size === 2) {
      const pts = Array.from(activePointersRef.current.values()) as { x: number; y: number }[];
      const p1 = pts[0];
      const p2 = pts[1];
      const currentDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const currentAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

      const scaleRatio = currentDist / (inter.startDistance || currentDist);
      const angleDelta = currentAngle - (inter.startAngle || currentAngle);

      const target = inter.startAnnState;
      if (!target) return;

      const canvas = canvasRef.current;
      const w = canvas?.width || 1;
      const h = canvas?.height || 1;

      const currentMid = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
      };
      const dx = (currentMid.x - (inter.startCenter?.x || currentMid.x)) / w;
      const dy = (currentMid.y - (inter.startCenter?.y || currentMid.y)) / h;

      annotationsRef.current = annotationsRef.current.map((ann) => {
        if (ann.id !== inter.targetId) return ann;

        if (ann.type === "frame" && target.type === "frame") {
          return {
            ...ann,
            x: Math.max(0.05, Math.min(0.95, target.x + dx)),
            y: Math.max(0.05, Math.min(0.95, target.y + dy)),
            width: Math.max(0.05, Math.min(0.9, target.width * scaleRatio)),
            height: Math.max(0.05, Math.min(0.9, target.height * scaleRatio)),
            rotation: target.rotation + angleDelta,
          };
        } else if (ann.type === "arrow" && target.type === "arrow") {
          const tcx = (target.start.x + target.end.x) / 2 + dx;
          const tcy = (target.start.y + target.end.y) / 2 + dy;
          const tvx = (target.end.x - target.start.x) / 2;
          const tvy = (target.end.y - target.start.y) / 2;

          const cos = Math.cos(angleDelta);
          const sin = Math.sin(angleDelta);
          const rx = (tvx * cos - tvy * sin) * scaleRatio;
          const ry = (tvx * sin + tvy * cos) * scaleRatio;

          return {
            ...ann,
            start: { x: tcx - rx, y: tcy - ry },
            end: { x: tcx + rx, y: tcy + ry },
          };
        } else if (ann.type === "text" && target.type === "text") {
          return {
            ...ann,
            position: {
              x: Math.max(0.05, Math.min(0.95, target.position.x + dx)),
              y: Math.max(0.05, Math.min(0.95, target.position.y + dy)),
            },
            scale: Math.max(0.4, Math.min(3, (target.scale || 1) * scaleRatio)),
            rotation: (target.rotation || 0) + angleDelta,
          };
        }
        return ann;
      });

      drawScene();
      return;
    }

    const pt = getNormalizedPoint(e.clientX, e.clientY);
    if (!pt) return;

    // Drawing new stroke or shape
    if (inter.mode === "draw" && draftRef.current) {
      if (draftRef.current.type === "pen") {
        draftRef.current.points.push(pt);
      } else if (draftRef.current.type === "arrow") {
        draftRef.current.end = pt;
      } else if (draftRef.current.type === "frame" && inter.startPointer) {
        const sp = inter.startPointer;
        const x1 = Math.min(sp.x, pt.x);
        const y1 = Math.min(sp.y, pt.y);
        const x2 = Math.max(sp.x, pt.x);
        const y2 = Math.max(sp.y, pt.y);
        draftRef.current.x = (x1 + x2) / 2;
        draftRef.current.y = (y1 + y2) / 2;
        draftRef.current.width = Math.max(0.02, x2 - x1);
        draftRef.current.height = Math.max(0.02, y2 - y1);
      }
      drawScene();
      return;
    }

    // Dragging (moving) selected object
    if (inter.mode === "drag" && inter.startPointer && inter.startAnnState) {
      const dx = pt.x - inter.startPointer.x;
      const dy = pt.y - inter.startPointer.y;
      const target = inter.startAnnState;

      annotationsRef.current = annotationsRef.current.map((ann) => {
        if (ann.id !== inter.targetId) return ann;

        if (ann.type === "frame" && target.type === "frame") {
          return {
            ...ann,
            x: Math.max(0.02, Math.min(0.98, target.x + dx)),
            y: Math.max(0.02, Math.min(0.98, target.y + dy)),
          };
        } else if (ann.type === "arrow" && target.type === "arrow") {
          return {
            ...ann,
            start: { x: target.start.x + dx, y: target.start.y + dy },
            end: { x: target.end.x + dx, y: target.end.y + dy },
          };
        } else if (ann.type === "text" && target.type === "text") {
          return {
            ...ann,
            position: {
              x: Math.max(0.02, Math.min(0.98, target.position.x + dx)),
              y: Math.max(0.02, Math.min(0.98, target.position.y + dy)),
            },
          };
        } else if (ann.type === "pen" && target.type === "pen") {
          return {
            ...ann,
            points: target.points.map((p) => ({
              x: p.x + dx,
              y: p.y + dy,
            })),
          };
        }
        return ann;
      });

      drawScene();
      return;
    }

    // Rotating selected object
    if (inter.mode === "rotate" && inter.startAnnState) {
      const target = inter.startAnnState;
      const canvas = canvasRef.current;
      const w = canvas?.width || 1;
      const h = canvas?.height || 1;

      let cx = 0,
        cy = 0;
      if (target.type === "frame") {
        cx = target.x * w;
        cy = target.y * h;
      } else if (target.type === "arrow") {
        cx = ((target.start.x + target.end.x) / 2) * w;
        cy = ((target.start.y + target.end.y) / 2) * h;
      } else if (target.type === "text") {
        cx = target.position.x * w;
        cy = target.position.y * h;
      }

      const currentAngle = Math.atan2(pt.y * h - cy, pt.x * w - cx);
      const angle = currentAngle + Math.PI / 2; // Offset for top handle

      annotationsRef.current = annotationsRef.current.map((ann) => {
        if (ann.id !== inter.targetId) return ann;

        if (ann.type === "frame") {
          return { ...ann, rotation: angle };
        } else if (ann.type === "arrow" && target.type === "arrow") {
          const tcx = (target.start.x + target.end.x) / 2;
          const tcy = (target.start.y + target.end.y) / 2;
          const halfLen =
            Math.hypot(
              target.end.x - target.start.x,
              target.end.y - target.start.y
            ) / 2;
          const dirAngle = currentAngle;
          const rx = Math.cos(dirAngle) * halfLen;
          const ry = Math.sin(dirAngle) * halfLen;
          return {
            ...ann,
            start: { x: tcx - rx, y: tcy - ry },
            end: { x: tcx + rx, y: tcy + ry },
          };
        } else if (ann.type === "text") {
          return { ...ann, rotation: angle };
        }
        return ann;
      });

      drawScene();
      return;
    }

    // Scaling / resizing selected object
    if (inter.mode === "scale" && inter.startPointer && inter.startAnnState) {
      const target = inter.startAnnState;
      const canvas = canvasRef.current;
      const w = canvas?.width || 1;
      const h = canvas?.height || 1;

      annotationsRef.current = annotationsRef.current.map((ann) => {
        if (ann.id !== inter.targetId) return ann;

        if (ann.type === "frame" && target.type === "frame") {
          const cx = target.x * w;
          const cy = target.y * h;
          const rot = target.rotation || 0;
          const dx = pt.x * w - cx;
          const dy = pt.y * h - cy;
          const lx = dx * Math.cos(-rot) - dy * Math.sin(-rot);
          const ly = dx * Math.sin(-rot) + dy * Math.cos(-rot);

          const newW = Math.max(0.04, (Math.abs(lx) * 2) / w);
          const newH = Math.max(0.04, (Math.abs(ly) * 2) / h);
          return { ...ann, width: newW, height: newH };
        } else if (ann.type === "arrow" && target.type === "arrow") {
          if (inter.corner === "start") {
            return { ...ann, start: pt };
          } else if (inter.corner === "end") {
            return { ...ann, end: pt };
          }
        } else if (ann.type === "text" && target.type === "text") {
          const distStart = Math.hypot(
            inter.startPointer!.x - target.position.x,
            inter.startPointer!.y - target.position.y
          );
          const distNow = Math.hypot(
            pt.x - target.position.x,
            pt.y - target.position.y
          );
          const scaleMult = distStart > 0 ? distNow / distStart : 1;
          return {
            ...ann,
            scale: Math.max(0.4, Math.min(3, (target.scale || 1) * scaleMult)),
          };
        }
        return ann;
      });

      drawScene();
      return;
    }
  };

  // Pointer Up Handler
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.delete(e.pointerId);

    const inter = interactionRef.current;

    if (inter.mode === "draw" && draftRef.current) {
      const draft = draftRef.current;
      let isValid = false;

      if (draft.type === "pen" && draft.points.length > 1) {
        isValid = true;
      } else if (draft.type === "arrow") {
        const dist = Math.hypot(
          draft.end.x - draft.start.x,
          draft.end.y - draft.start.y
        );
        isValid = dist > 0.02;
      } else if (draft.type === "frame") {
        isValid = draft.width > 0.02 && draft.height > 0.02;
      }

      if (isValid) {
        annotationsRef.current.push(draft);
        setAnnotations([...annotationsRef.current]);
        // Auto-select newly created object for immediate adjustment!
        setSelectedId(draft.id);
        selectedIdRef.current = draft.id;
      }
      draftRef.current = null;
    } else if (
      inter.mode === "drag" ||
      inter.mode === "scale" ||
      inter.mode === "rotate" ||
      inter.mode === "pinch"
    ) {
      setAnnotations([...annotationsRef.current]);
    }

    if (activePointersRef.current.size === 0) {
      interactionRef.current = { mode: "none" };
    }

    drawScene();
  };

  // Finalize live text input
  const finalizeLiveText = () => {
    if (liveTextValue.trim()) {
      const newText: TextAnnotation = {
        id: `text-${Date.now()}`,
        type: "text",
        position: liveTextPos,
        text: liveTextValue.trim(),
        color,
        size: strokeWidth >= 14 ? 20 : strokeWidth >= 8 ? 16 : 13,
        rotation: 0,
        scale: 1,
      };
      annotationsRef.current.push(newText);
      setAnnotations([...annotationsRef.current]);
      setSelectedId(newText.id);
      selectedIdRef.current = newText.id;
    }
    setLiveTextActive(false);
    setLiveTextValue("");
    drawScene();
  };

  // Rotate selected item 90 degrees
  const handleRotateSelected90 = () => {
    if (!selectedId) return;
    setAnnotations((prev) =>
      prev.map((ann) => {
        if (ann.id !== selectedId) return ann;
        if (ann.type === "frame" || ann.type === "text") {
          return {
            ...ann,
            rotation: ((ann.rotation || 0) + Math.PI / 2) % (Math.PI * 2),
          };
        } else if (ann.type === "arrow") {
          const cx = (ann.start.x + ann.end.x) / 2;
          const cy = (ann.start.y + ann.end.y) / 2;
          const vx = (ann.end.x - ann.start.x) / 2;
          const vy = (ann.end.y - ann.start.y) / 2;
          // rotate by 90 deg: (vx, vy) -> (-vy, vx)
          return {
            ...ann,
            start: { x: cx + vy, y: cy - vx },
            end: { x: cx - vy, y: cy + vx },
          };
        }
        return ann;
      })
    );
  };

  // Duplicate selected item
  const handleDuplicateSelected = () => {
    if (!selectedId) return;
    const item = annotations.find((a) => a.id === selectedId);
    if (!item) return;

    let duplicate: Annotation;
    const offset = 0.04;
    const newId = `${item.type}-${Date.now()}`;

    if (item.type === "frame") {
      duplicate = {
        ...item,
        id: newId,
        x: Math.min(0.9, item.x + offset),
        y: Math.min(0.9, item.y + offset),
      };
    } else if (item.type === "arrow") {
      duplicate = {
        ...item,
        id: newId,
        start: { x: item.start.x + offset, y: item.start.y + offset },
        end: { x: item.end.x + offset, y: item.end.y + offset },
      };
    } else if (item.type === "text") {
      duplicate = {
        ...item,
        id: newId,
        position: {
          x: Math.min(0.9, item.position.x + offset),
          y: Math.min(0.9, item.position.y + offset),
        },
      };
    } else {
      duplicate = {
        ...item,
        id: newId,
        points: item.points.map((p) => ({
          x: p.x + offset,
          y: p.y + offset,
        })),
      };
    }

    setAnnotations((prev) => [...prev, duplicate]);
    setSelectedId(newId);
    toast.success("Object duplicated");
  };

  // Delete selected item
  const handleDeleteSelected = () => {
    if (!selectedId) return;
    setAnnotations((prev) => prev.filter((a) => a.id !== selectedId));
    setSelectedId(null);
    selectedIdRef.current = null;
    toast("Object deleted");
  };

  // Keyboard shortcut to delete selected item
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (liveTextActive) return;
      if (e.key === "Backspace" || e.key === "Delete") {
        if (selectedIdRef.current) {
          handleDeleteSelected();
        }
      }
      if (e.key === "Escape") {
        setSelectedId(null);
        selectedIdRef.current = null;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [liveTextActive, selectedId]);

  const handleUndo = () => {
    if (annotationsRef.current.length === 0) return;
    const removed = annotationsRef.current.pop();
    if (removed && removed.id === selectedIdRef.current) {
      setSelectedId(null);
      selectedIdRef.current = null;
    }
    setAnnotations([...annotationsRef.current]);
    drawScene();
  };

  const handleClear = () => {
    if (annotationsRef.current.length === 0) return;
    annotationsRef.current = [];
    setAnnotations([]);
    setSelectedId(null);
    selectedIdRef.current = null;
    drawScene();
    toast("All annotations cleared");
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

      // Draw all annotations at native high-resolution scale (without selection handles)
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

  if (!activeOpen || !file) return null;

  const selectedAnnotation = annotations.find((a) => a.id === selectedId);

  // Compute position for floating action toolbar above selected object
  let selectionToolbarPos: { x: number; y: number } | null = null;
  if (selectedAnnotation && canvasRef.current) {
    const w = canvasRef.current.width;
    const h = canvasRef.current.height;
    if (selectedAnnotation.type === "frame") {
      selectionToolbarPos = {
        x: selectedAnnotation.x * w,
        y: selectedAnnotation.y * h - (selectedAnnotation.height * h) / 2 - 42,
      };
    } else if (selectedAnnotation.type === "arrow") {
      const cx = (selectedAnnotation.start.x + selectedAnnotation.end.x) / 2;
      const cy = (selectedAnnotation.start.y + selectedAnnotation.end.y) / 2;
      selectionToolbarPos = {
        x: cx * w,
        y: cy * h - 45,
      };
    } else if (selectedAnnotation.type === "text") {
      selectionToolbarPos = {
        x: selectedAnnotation.position.x * w,
        y: selectedAnnotation.position.y * h - 40,
      };
    } else if (selectedAnnotation.type === "pen") {
      let minY = 1,
        avgX = 0;
      for (const p of selectedAnnotation.points) {
        avgX += p.x;
        if (p.y < minY) minY = p.y;
      }
      avgX /= selectedAnnotation.points.length;
      selectionToolbarPos = {
        x: avgX * w,
        y: minY * h - 35,
      };
    }
  }

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
                title="Undo last action"
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

          {handleSkip && annotations.length === 0 && (
            <button
              type="button"
              onClick={() => handleSkip(file)}
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
            {/* Original Photo Preview */}
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

            {/* Floating Object Action Toolbar (Adjust, Rotate 90, Duplicate, Delete) */}
            {selectedAnnotation && selectionToolbarPos && (
              <div
                style={{
                  left: `${Math.max(40, Math.min(canvasRef.current?.width || 200, selectionToolbarPos.x))}px`,
                  top: `${Math.max(16, selectionToolbarPos.y)}px`,
                  transform: "translate(-50%, -50%)",
                }}
                className="absolute z-30 flex items-center gap-1.5 rounded-2xl border border-white/20 bg-zinc-900/95 px-2 py-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.85)] backdrop-blur-xl animate-in zoom-in-95 duration-150 pointer-events-auto"
              >
                {/* Rotate 90 Button */}
                <button
                  type="button"
                  onClick={handleRotateSelected90}
                  className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/10 text-white/90 hover:bg-white/20 active:scale-95"
                  title="Rotate 90°"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </button>

                {/* Duplicate */}
                <button
                  type="button"
                  onClick={handleDuplicateSelected}
                  className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/10 text-white/90 hover:bg-white/20 active:scale-95"
                  title="Duplicate"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>

                <div className="h-4 w-px bg-white/20" />

                {/* Immediate Delete Button */}
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  className="flex items-center gap-1 rounded-xl bg-rose-500/20 border border-rose-500/40 px-2.5 py-1 text-xs font-semibold text-rose-300 hover:bg-rose-500/30 active:scale-95"
                  title="Delete object"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete</span>
                </button>
              </div>
            )}

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
        <div className="flex items-center justify-center gap-2.5 overflow-x-auto py-0.5">
          {/* Select / Move Tool */}
          <button
            type="button"
            onClick={() => {
              if (liveTextActive) finalizeLiveText();
              setTool("select");
            }}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-150 ${
              tool === "select"
                ? "bg-gradient-to-b from-cyan-400 to-cyan-500 text-zinc-950 shadow-[0_4px_14px_rgba(6,182,212,0.5),inset_0_1px_2px_rgba(255,255,255,0.4)] scale-105"
                : "border border-white/10 bg-white/5 text-white/70 shadow-[0_2px_6px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.1)] hover:bg-white/10 hover:text-white"
            } active:scale-95`}
          >
            <MousePointer2 className="h-4 w-4" />
            <span>Select</span>
          </button>

          {/* 3D Frame */}
          <button
            type="button"
            onClick={() => {
              if (liveTextActive) finalizeLiveText();
              setTool("frame");
              setSelectedId(null);
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

          {/* 3D Arrow */}
          <button
            type="button"
            onClick={() => {
              if (liveTextActive) finalizeLiveText();
              setTool("arrow");
              setSelectedId(null);
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

          {/* Pen / Freehand */}
          <button
            type="button"
            onClick={() => {
              if (liveTextActive) finalizeLiveText();
              setTool("pen");
              setSelectedId(null);
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

          {/* 3D Text */}
          <button
            type="button"
            onClick={() => {
              setTool("text");
              setSelectedId(null);
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
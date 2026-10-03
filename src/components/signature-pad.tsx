"use client";

import { useEffect, useRef, useState } from "react";

const W = 600;
const H = 200;

/** Crops a canvas to its inked area (plus padding) and returns a PNG data URL, or "" if blank. */
function trimmedPng(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return "";
  const pad = 8;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(width - 1, x1 + pad);
  y1 = Math.min(height - 1, y1 + pad);
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext("2d")!.drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

/**
 * Draw or upload an e-signature. The result is kept in a hidden input `name` as a PNG data URL
 * ("" = no signature).
 */
export function SignaturePad({ name, initial, label }: { name: string; initial: string | null; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [value, setValue] = useState(initial ?? "");
  const [mode, setMode] = useState<"view" | "draw">(initial ? "view" : "draw");
  const [error, setError] = useState("");

  useEffect(() => {
    if (mode !== "draw") return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
  }, [mode]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = e.currentTarget.getContext("2d")!;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.1, p.y);
    ctx.stroke();
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d")!;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    if (canvasRef.current) setValue(trimmedPng(canvasRef.current));
  }
  function clear() {
    canvasRef.current?.getContext("2d")!.clearRect(0, 0, W, H);
    setValue("");
  }

  // Uploaded photo/scan: scale to fit, turn near-white pixels transparent, then trim.
  function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return setError("Choose a PNG or JPG image.");
    if (file.size > 8 * 1024 * 1024) return setError("That image is too large.");
    setError("");
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(W / img.width, H / img.height, 1);
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const d = ctx.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < d.data.length; i += 4) {
        if (d.data[i] > 225 && d.data[i + 1] > 225 && d.data[i + 2] > 225) d.data[i + 3] = 0;
      }
      ctx.putImageData(d, 0, 0);
      const png = trimmedPng(c);
      if (!png) return setError("Couldn’t find a signature in that image.");
      setValue(png);
      setMode("view");
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => setError("Couldn’t read that image.");
    img.src = URL.createObjectURL(file);
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={value} />
      <div className="label">{label}</div>
      {mode === "view" ? (
        <div className="flex h-28 items-center justify-center rounded-md border border-slate-200 bg-white p-2">
          {value ? <img src={value} alt="Signature" className="max-h-full max-w-full object-contain" /> : <span className="text-sm text-slate-400">No signature</span>}
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full touch-none rounded-md border border-dashed border-slate-300 bg-white"
          style={{ aspectRatio: `${W} / ${H}`, height: "auto" }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          aria-label="Draw your signature here"
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        {mode === "view" ? (
          <button type="button" className="btn btn-sm" onClick={() => { setMode("draw"); setValue(""); }}>Draw new</button>
        ) : (
          <>
            <span className="text-xs text-slate-500">Sign in the box with your mouse, finger or stylus.</span>
            <button type="button" className="btn btn-sm" onClick={clear}>Clear</button>
          </>
        )}
        <label className="btn btn-sm cursor-pointer">
          Upload image
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={upload} />
        </label>
        {value && (
          <button type="button" className="btn btn-sm btn-danger" onClick={() => { setValue(""); setMode("view"); }}>Remove</button>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

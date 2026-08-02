"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { generateId, compressFile, createChunks, type Chunk } from "@/utils/chunker";
import { cn } from "@/utils/cn";
import Link from "next/link";

const CHUNK_SIZE = 400;

export default function Sender() {
  const [file, setFile] = useState<File | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [fps, setFps] = useState(8);
  const [playing, setPlaying] = useState(false);
  const [qrUrl, setQrUrl] = useState("");
  const [originalSize, setOriginalSize] = useState(0);
  const [compressedSize, setCompressedSize] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [brightnessOn, setBrightnessOn] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (selected.size > 2 * 1024 * 1024) { alert("Max 2 MB"); return; }
    setPreparing(true); setPlaying(false); setFile(selected);
    setOriginalSize(selected.size);
    try {
      const compressed = await compressFile(selected);
      setCompressedSize(compressed.length);
      const generated = createChunks(compressed, CHUNK_SIZE, {
        id: generateId(), mimeType: selected.type || "application/octet-stream", fileName: selected.name,
      });
      setChunks(generated); setCurrentIdx(0);
    } finally { setPreparing(false); }
  };

  const renderQr = useCallback(async (chunk: Chunk) => {
    try {
      const url = await QRCode.toDataURL(JSON.stringify(chunk), {
        margin: 2, width: 380, errorCorrectionLevel: "L",
        color: { dark: "#000000ff", light: "#ffffffff" },
      });
      setQrUrl(url);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { if (chunks.length > 0) renderQr(chunks[currentIdx]); }, [currentIdx, chunks, renderQr]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!playing || chunks.length === 0) return;
    intervalRef.current = setInterval(() => setCurrentIdx(p => (p + 1) % chunks.length), Math.round(1000 / fps));
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, fps, chunks.length]);

  const togglePlay = () => setPlaying(p => !p);
  const pct = chunks.length > 0 ? ((currentIdx + 1) / chunks.length * 100).toFixed(1) : "0.0";
  const fmtSize = (b: number) => b >= 1048576 ? `${(b / 1048576).toFixed(2)} MB` : `${(b / 1024).toFixed(0)} KB`;

  return (
    <div className="bg-[#131315] text-[#e5e1e4] min-h-screen flex flex-col antialiased selection:bg-[#4cd7f6]/30 selection:text-[#4cd7f6] font-[Inter,sans-serif]">
      {/* Scanline overlay */}
      <div className="pointer-events-none fixed inset-0 z-0" style={{background:"linear-gradient(to bottom,rgba(255,255,255,0),rgba(255,255,255,0) 50%,rgba(0,0,0,0.1) 50%,rgba(0,0,0,0.1))",backgroundSize:"100% 4px"}} />

      {/* Top App Bar */}
      <header className="fixed flex justify-between items-center w-full px-8 h-16 bg-[#131315] border-b border-[#3d494c] z-50 top-0">
        <div className="flex items-center gap-6">
          <h1 className="text-2xl font-bold text-[#4cd7f6] tracking-tighter uppercase">BEAM-NET</h1>
          <div className="hidden sm:flex border border-[#4edea3] bg-[#4edea3]/10 px-2 py-1 items-center gap-2">
            <div className="w-1.5 h-1.5 bg-[#4edea3] animate-pulse" />
            <span className="text-[11px] font-mono font-semibold text-[#4edea3] uppercase tracking-widest">OFFLINE</span>
          </div>
        </div>
        <nav className="hidden md:flex items-center h-full gap-2">
          <span className="text-[#4cd7f6] border-b-2 border-[#4cd7f6] py-4 px-2 text-[11px] font-mono uppercase tracking-widest flex items-center h-full">Broadcaster</span>
          <Link href="/scan" className="text-[#bcc9cd] py-4 px-2 text-[11px] font-mono uppercase tracking-widest hover:text-[#4cd7f6] flex items-center h-full transition-colors">Collector</Link>
        </nav>
        <div className="flex items-center gap-4">
          <button className="text-[#bcc9cd] hover:text-[#4cd7f6] transition-colors text-xl">⊗</button>
          <button className="text-[#bcc9cd] hover:text-[#4cd7f6] transition-colors text-xl">◯</button>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-[80px] px-4 md:px-8 max-w-[1440px] w-full mx-auto flex-1 flex flex-col gap-4 pb-[120px]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">

          {/* Left Panel – Source File */}
          <section className="lg:col-span-5 flex flex-col gap-4">
            <div className="bg-[#131315] border border-[#3d494c] p-4 h-full flex flex-col">
              <header className="flex justify-between items-center mb-6 pb-2 border-b border-[#3d494c]">
                <h2 className="text-[11px] font-mono uppercase tracking-widest text-[#bcc9cd]">Source File</h2>
                <span className="text-[#3d494c] text-sm">📂</span>
              </header>

              {/* Dropzone */}
              <label className="border border-dashed border-[#3d494c] bg-[#0e0e10] h-48 mb-6 flex flex-col items-center justify-center gap-3 cursor-pointer group hover:border-solid hover:border-[#4cd7f6] transition-all relative overflow-hidden">
                <div className="absolute inset-0 bg-[#4cd7f6]/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <span className="text-4xl text-[#869397] group-hover:text-[#4cd7f6] transition-colors z-10">⬆</span>
                <p className="text-[11px] font-mono uppercase tracking-widest text-[#bcc9cd] group-hover:text-[#4cd7f6] transition-colors z-10">
                  {file ? file.name : "DRAG & DROP SECURE PAYLOAD HERE"}
                </p>
                <p className="text-[9px] font-mono text-[#3d494c] mt-1 z-10">Supported: PDF, PNG, JPG, MP4, ZIP (Max 2MB)</p>
                <input type="file" accept="image/*,application/pdf,video/*,audio/*" onChange={handleFileChange} className="hidden" />
              </label>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="border border-[#3d494c] bg-[#0e0e10] p-3 flex flex-col justify-between">
                  <span className="text-[11px] font-mono uppercase text-[#3d494c]">Original Size</span>
                  <span className="text-[18px] font-mono text-[#e5e1e4] mt-2">{originalSize ? fmtSize(originalSize) : "—"}</span>
                </div>
                <div className="border border-[#3d494c] border-b-2 border-b-[#4edea3] bg-[#0e0e10] p-3 flex flex-col justify-between">
                  <span className="text-[11px] font-mono uppercase text-[#3d494c]">Compressed</span>
                  <span className="text-[18px] font-mono text-[#4edea3] mt-2">{compressedSize ? fmtSize(compressedSize) : preparing ? "..." : "—"}</span>
                </div>
                <div className="border border-[#3d494c] bg-[#0e0e10] p-3 flex flex-col justify-between">
                  <span className="text-[11px] font-mono uppercase text-[#3d494c]">Total Chunks</span>
                  <span className="text-[18px] font-mono text-[#e5e1e4] mt-2">{chunks.length || "—"}</span>
                </div>
                <div className="border border-[#3d494c] bg-[#0e0e10] p-3 flex flex-col justify-between">
                  <span className="text-[11px] font-mono uppercase text-[#3d494c]">Saved</span>
                  <span className="text-[18px] font-mono text-[#4edea3] mt-2">
                    {originalSize && compressedSize ? `${Math.round((1 - compressedSize / originalSize) * 100)}%` : "—"}
                  </span>
                </div>
              </div>

              <div className="flex-1" />

              {/* Action Buttons */}
              <div className="flex flex-col gap-3">
                <button
                  onClick={togglePlay}
                  disabled={chunks.length === 0}
                  className={cn(
                    "w-full font-mono text-[11px] uppercase tracking-widest py-4 border flex items-center justify-center gap-2 transition-all active:scale-[0.98]",
                    chunks.length > 0
                      ? "bg-[#4cd7f6] text-[#003640] border-[#4cd7f6] hover:bg-[#4cd7f6]/90 shadow-[0_0_12px_rgba(76,215,246,0.2)]"
                      : "bg-transparent text-[#3d494c] border-[#3d494c] cursor-not-allowed"
                  )}
                >
                  <span>{playing ? "⏸" : "📡"}</span>
                  {playing ? "Pause Transmission" : "Start Transmission"}
                </button>
                {playing && (
                  <button
                    onClick={() => setPlaying(false)}
                    className="w-full bg-transparent border border-[#3d494c] text-[#e5e1e4] font-mono text-[11px] uppercase tracking-widest py-3 hover:bg-[#39393b]/10 hover:border-[#869397] transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    <span>⏸</span> Pause
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Right Panel – Optical Payload */}
          <section className="lg:col-span-7 flex flex-col">
            <div className="bg-[#131315] border border-[#3d494c] p-4 h-full flex flex-col relative overflow-hidden">
              {/* Corner accents */}
              <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-[#869397]" />
              <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-[#869397]" />
              <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-[#869397]" />
              <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-[#869397]" />

              <header className="flex justify-between items-center mb-6 pb-2 border-b border-[#3d494c] gap-4">
                <h2 className="text-[11px] font-mono uppercase tracking-widest text-[#bcc9cd] flex items-center gap-2">
                  <span className="w-2 h-2 bg-[#4edea3] inline-block" />
                  Optical Payload
                </h2>
                <span className={cn("text-[18px] font-mono whitespace-nowrap", playing ? "text-[#4edea3] animate-pulse" : "text-[#3d494c]")}>
                  {playing ? `BROADCASTING AT ${fps} FPS` : chunks.length > 0 ? "READY TO BROADCAST" : "AWAITING PAYLOAD"}
                </span>
              </header>

              {/* Canvas area */}
              <div className="flex-1 flex items-center justify-center bg-[#0e0e10] border border-[#3d494c] relative p-8">
                <div className="absolute top-4 left-4 text-[10px] font-mono text-[#3d494c]">
                  {chunks.length > 0 ? `IDX: ${String(currentIdx).padStart(5, "0")}` : "X: -- Y: --"}
                </div>
                <div className="absolute bottom-4 right-4 text-[10px] font-mono text-[#3d494c]">
                  SEQ: {String(currentIdx).padStart(5, "0")}
                </div>

                {/* QR Code display */}
                <div className="relative">
                  {qrUrl && chunks.length > 0 ? (
                    <div className="relative">
                      <div className="absolute -inset-1 border border-[#4cd7f6]/30 shadow-[0_0_30px_rgba(76,215,246,0.15)]" />
                      <img src={qrUrl} alt={`QR chunk ${currentIdx + 1}`} width={320} height={320} className="block" />
                      {/* Laser scan line */}
                      {playing && (
                        <div className="absolute left-0 right-0 h-0.5 bg-[#4cd7f6]/80 blur-[2px] w-full mix-blend-difference animate-ping" style={{top:"50%"}} />
                      )}
                    </div>
                  ) : (
                    <div className="w-[300px] h-[300px] sm:w-[360px] sm:h-[360px] bg-white border-2 border-black flex items-center justify-center">
                      <div className="w-full h-full grid grid-cols-[repeat(21,1fr)] grid-rows-[repeat(21,1fr)] gap-0 bg-white p-2">
                        <div className="col-start-1 row-start-1 col-span-7 row-span-7 bg-black p-[1fr]"><div className="w-full h-full bg-white p-[1fr]"><div className="w-full h-full bg-black" /></div></div>
                        <div className="col-start-15 row-start-1 col-span-7 row-span-7 bg-black p-[1fr]"><div className="w-full h-full bg-white p-[1fr]"><div className="w-full h-full bg-black" /></div></div>
                        <div className="col-start-1 row-start-15 col-span-7 row-span-7 bg-black p-[1fr]"><div className="w-full h-full bg-white p-[1fr]"><div className="w-full h-full bg-black" /></div></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Footer Controls */}
      <footer className="fixed bottom-0 left-0 w-full bg-[#131315] border-t border-[#3d494c] p-4 z-40">
        <div className="max-w-[1440px] mx-auto w-full grid grid-cols-1 md:grid-cols-12 gap-6 items-center">

          {/* FPS Slider */}
          <div className="md:col-span-3 flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-mono uppercase text-[#bcc9cd]">FPS Control</span>
              <span className="text-[18px] font-mono text-[#4cd7f6]">{fps}.0</span>
            </div>
            <SliderPrimitive.Root min={3} max={12} step={1} value={[fps]} onValueChange={v => setFps(v[0])}
              className="relative flex items-center select-none touch-none w-full h-4">
              <SliderPrimitive.Track className="bg-[#353437] relative grow h-1">
                <SliderPrimitive.Range className="absolute bg-[#4cd7f6] h-full" />
              </SliderPrimitive.Track>
              <SliderPrimitive.Thumb className="block w-2 h-4 bg-[#4cd7f6] shadow-[0_0_8px_rgba(76,215,246,0.5)] focus:outline-none" />
            </SliderPrimitive.Root>
            <div className="flex justify-between text-[9px] font-mono text-[#3d494c]">
              <span>3 MIN</span><span>12 MAX</span>
            </div>
          </div>

          {/* Max Brightness toggle */}
          <div className="md:col-span-2 flex items-center justify-between border border-[#3d494c] px-3 py-2 bg-[#0e0e10]">
            <span className="text-[11px] font-mono uppercase text-[#bcc9cd]">Max Brightness</span>
            <button
              onClick={() => setBrightnessOn(b => !b)}
              className={cn("w-9 h-5 relative transition-colors", brightnessOn ? "bg-[#4cd7f6]" : "bg-[#353437]")}
              style={{boxShadow: brightnessOn ? "0 0 8px rgba(76,215,246,0.3)" : "none"}}
            >
              <div className={cn("absolute top-0.5 w-4 h-4 bg-white border border-[#3d494c] transition-transform", brightnessOn ? "left-[18px]" : "left-[2px]")} />
            </button>
          </div>

          {/* Progress bar */}
          <div className="md:col-span-7 flex flex-col gap-2">
            <div className="flex justify-between items-end">
              <div className="flex flex-col">
                <span className="text-[11px] font-mono uppercase text-[#bcc9cd] mb-1">Transmission Progress</span>
                <span className="text-[18px] font-mono text-[#e5e1e4]">
                  {chunks.length > 0 ? `Chunk ${currentIdx + 1} of ${chunks.length}` : "No payload loaded"}
                </span>
              </div>
              <span className="text-[18px] font-mono text-[#4cd7f6] drop-shadow-[0_0_4px_rgba(76,215,246,0.5)]">{pct}%</span>
            </div>
            <div className="w-full bg-[#353437] h-1.5 border border-[#3d494c]/30">
              <div className="bg-[#4cd7f6] h-full relative overflow-hidden shadow-[0_0_12px_rgba(76,215,246,0.2)] transition-[width] duration-150" style={{width:`${pct}%`}}>
                <div className="absolute inset-0 w-full h-full" style={{background:"linear-gradient(45deg,rgba(0,0,0,0.1) 25%,transparent 25%,transparent 50%,rgba(0,0,0,0.1) 50%,rgba(0,0,0,0.1) 75%,transparent 75%,transparent)",backgroundSize:"16px 16px"}} />
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

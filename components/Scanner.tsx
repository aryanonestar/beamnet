"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import jsQR from "jsqr";
import { reassemble, decompress, verifyCrc, type Chunk } from "@/utils/chunker";
import { cn } from "@/utils/cn";
import Link from "next/link";

export default function Scanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Scan state in refs to prevent stale closures in rAF
  const chunksMapRef = useRef<Map<number, Chunk>>(new Map());
  const transmissionIdRef = useRef<string | null>(null);
  const totalChunksRef = useRef<number | null>(null);
  const mimeTypeRef = useRef<string>("");
  const fileNameRef = useRef<string>("");
  const completedRef = useRef(false);

  // Reactive UI state
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [receivedCount, setReceivedCount] = useState(0);
  const [totalChunks, setTotalChunks] = useState<number | null>(null);
  const [bitmask, setBitmask] = useState<boolean[]>([]);
  const [completed, setCompleted] = useState(false);
  const [blobUrl, setBlobUrl] = useState("");
  const [mimeType, setMimeType] = useState("");
  const [fileName, setFileName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [scanFps, setScanFps] = useState(0);
  const [droppedFrames, setDroppedFrames] = useState(0);
  const [terminalLog, setTerminalLog] = useState<string[]>([
    "> Init recv sequence... OK",
    "> Handshake negotiated via optic channel",
    "> Awaiting first frame block...",
  ]);
  const [showModal, setShowModal] = useState(false);
  const lastFrameTime = useRef(Date.now());
  const frameCount = useRef(0);

  const addLog = useCallback((msg: string) => {
    setTerminalLog(prev => [...prev.slice(-6), `> ${msg}`]);
  }, []);

  // ── Camera init ──────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setPermissionGranted(true);
      addLog("Camera feed active — point at Broadcaster QR");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Camera access denied";
      setCameraError(msg);
    }
  }, [addLog]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    startCamera();
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); stopCamera(); };
  }, [startCamera, stopCamera]);

  // ── rAF scan loop ────────────────────────────────────────────
  useEffect(() => {
    if (!permissionGranted) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !ctx) return;

    const tick = () => {
      const video = videoRef.current;
      if (video && video.readyState >= video.HAVE_ENOUGH_DATA) {
        const w = video.videoWidth, h = video.videoHeight;
        canvas.width = w; canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const code = jsQR(imageData.data, w, h, { inversionAttempts: "dontInvert" });

        // FPS calc
        frameCount.current++;
        const now = Date.now();
        if (now - lastFrameTime.current >= 1000) {
          setScanFps(frameCount.current);
          frameCount.current = 0;
          lastFrameTime.current = now;
        }

        if (code?.data) {
          try {
            const parsed: Chunk = JSON.parse(code.data);
            const { meta } = parsed;

            if (!transmissionIdRef.current) {
              transmissionIdRef.current = meta.id;
              totalChunksRef.current = meta.totalChunks;
              mimeTypeRef.current = meta.mimeType;
              fileNameRef.current = meta.fileName;
              chunksMapRef.current = new Map();
              completedRef.current = false;
              setTotalChunks(meta.totalChunks);
              setMimeType(meta.mimeType);
              setFileName(meta.fileName);
              setBitmask(new Array(meta.totalChunks).fill(false));
              setReceivedCount(0); setCompleted(false); setBlobUrl(""); setErrorMsg("");
              addLog(`New transmission detected — ${meta.totalChunks} chunks`);
            }

            const same = meta.id === transmissionIdRef.current && meta.totalChunks === totalChunksRef.current;
            if (same && !chunksMapRef.current.has(meta.chunkIndex) && !completedRef.current) {
              chunksMapRef.current.set(meta.chunkIndex, parsed);
              const newCount = chunksMapRef.current.size;
              setReceivedCount(newCount);
              setBitmask(prev => { const n = [...prev]; n[meta.chunkIndex] = true; return n; });
              if (newCount % 50 === 0) addLog(`Block [0x${meta.chunkIndex.toString(16).toUpperCase()}] verified — ${newCount}/${meta.totalChunks}`);

              if (newCount === totalChunksRef.current) {
                completedRef.current = true;
                const allChunks = Array.from(chunksMapRef.current.values());
                const raw = reassemble(allChunks);
                if (!verifyCrc(raw, allChunks[0].meta.crc32)) {
                  setErrorMsg("⚠️ CRC32 integrity check failed — rescan required");
                  completedRef.current = false;
                  addLog("ERROR: CRC32 mismatch — integrity check failed");
                } else {
                  decompress(raw).then(decompressed => {
                    const blob = new Blob([decompressed as unknown as Uint8Array<ArrayBuffer>], { type: mimeTypeRef.current });
                    setBlobUrl(URL.createObjectURL(blob));
                    setCompleted(true);
                    setShowModal(true);
                    stopCamera();
                    if (animRef.current) cancelAnimationFrame(animRef.current);
                    addLog(`File reassembled & verified — ${fileNameRef.current}`);
                  }).catch((err: unknown) => {
                    const m = err instanceof Error ? err.message : "Decompression error";
                    setErrorMsg(m); completedRef.current = false;
                  });
                }
              }
            } else if (same && chunksMapRef.current.has(meta.chunkIndex)) {
              setDroppedFrames(d => d + 1);
            }
          } catch { /* ignore non-BEAM-NET QR */ }
        }
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [permissionGranted, stopCamera, addLog]);

  const reset = async () => {
    chunksMapRef.current = new Map();
    transmissionIdRef.current = null; totalChunksRef.current = null; completedRef.current = false;
    setReceivedCount(0); setTotalChunks(null); setBitmask([]); setCompleted(false);
    setBlobUrl(""); setMimeType(""); setFileName(""); setErrorMsg(""); setDroppedFrames(0); setShowModal(false);
    setTerminalLog(["> Session reset", "> Awaiting new optical payload..."]);
    await startCamera();
  };

  const pct = totalChunks ? (receivedCount / totalChunks * 100) : 0;
  const missing = totalChunks ? totalChunks - receivedCount : 0;

  return (
    <div className="bg-[#131315] text-[#e5e1e4] min-h-screen flex flex-col font-[Inter,sans-serif] overflow-x-hidden selection:bg-[#4cd7f6] selection:text-[#003640]">

      {/* Top App Bar */}
      <header className="bg-[#131315] border-b border-[#3d494c] flex justify-between items-center w-full px-8 h-16 sticky top-0 z-50">
        <div className="flex items-center gap-8">
          <div className="text-2xl font-bold text-[#4cd7f6] tracking-tighter" style={{textShadow:"0 0 4px rgba(76,215,246,0.5)"}}>
            BEAM-NET
          </div>
          <nav className="hidden md:flex gap-2">
            <Link href="/send" className="text-[#bcc9cd] py-4 px-4 hover:bg-[#39393b]/10 hover:text-[#4cd7f6] transition-colors text-[11px] font-mono uppercase">Broadcaster</Link>
            <span className="text-[#4cd7f6] border-b-2 border-[#4cd7f6] py-4 px-4 text-[11px] font-mono uppercase" style={{boxShadow:"0 0 8px rgba(76,215,246,0.4)"}}>Collector</span>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <button className="text-[#bcc9cd] hover:text-[#4cd7f6] transition-colors p-2 border border-transparent hover:border-[#3d494c]">⊗</button>
          <button className="text-[#bcc9cd] hover:text-[#4cd7f6] transition-colors p-2 border border-transparent hover:border-[#3d494c]">◯</button>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-4 max-w-[1440px] mx-auto w-full">

        {/* Left Column – Viewport & Telemetry */}
        <div className="lg:col-span-8 flex flex-col gap-4">

          {/* Viewport Panel */}
          <section className="bg-[#131315] border border-[#3d494c] p-4 flex flex-col relative h-[512px] min-h-[400px]">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-[#3d494c]">
              <h2 className="text-[11px] font-mono text-[#4cd7f6] uppercase tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 bg-[#4cd7f6] animate-pulse" />
                Optical Receiver {permissionGranted ? "Active" : "Inactive"}
              </h2>
              <button onClick={reset} className="flex items-center gap-1 px-2 py-1 border border-[#3d494c] text-[#869397] hover:text-[#4cd7f6] hover:border-[#4cd7f6] transition-colors text-[11px] font-mono uppercase ml-4">
                ↺ Reset / New Scan
              </button>
              <span className="text-[11px] font-mono text-[#869397]">ID: REC-{Math.random().toString(36).slice(2,7).toUpperCase()}</span>
            </div>

            {/* Camera source dropdown */}
            <div className="mb-4 flex items-center gap-2">
              <label className="text-[11px] font-mono text-[#869397] uppercase">Source:</label>
              <div className="relative flex-1">
                <select className="w-full bg-[#0e0e10] border border-[#3d494c] text-[#4cd7f6] font-mono text-[11px] py-1 px-2 appearance-none focus:outline-none focus:border-[#4cd7f6] transition-colors">
                  <option>Main Camera (Rear)</option>
                  <option>Ultrawide</option>
                  <option>Front Camera</option>
                </select>
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[#869397] pointer-events-none text-xs">▼</span>
              </div>
            </div>

            {/* Camera feed */}
            <div className="flex-1 relative bg-black border border-[#3d494c] overflow-hidden flex items-center justify-center group">
              {/* Scanline overlay */}
              <div className="absolute inset-0 z-10 pointer-events-none" style={{background:"linear-gradient(to bottom,rgba(255,255,255,0),rgba(255,255,255,0) 50%,rgba(0,0,0,0.1) 50%,rgba(0,0,0,0.1))",backgroundSize:"100% 4px"}} />

              {/* Corner reticles */}
              {["top-4 left-4 border-t-2 border-l-2", "top-4 right-4 border-t-2 border-r-2", "bottom-4 left-4 border-b-2 border-l-2", "bottom-4 right-4 border-b-2 border-r-2"].map((pos, i) => (
                <div key={i} className={`absolute w-8 h-8 border-[#4edea3] z-20 ${pos}`} style={{animation:"pulse-emerald 2s infinite", borderColor: completed ? "rgba(78,222,163,1)" : undefined}} />
              ))}

              {/* Center crosshair */}
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-16 h-16 flex items-center justify-center opacity-30 z-20 pointer-events-none">
                <div className="w-full h-[1px] bg-[#4edea3] absolute" />
                <div className="h-full w-[1px] bg-[#4edea3] absolute" />
                <div className="w-4 h-4 border border-[#4edea3] rounded-full absolute" />
              </div>

              {cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-30 text-center p-4">
                  <p className="text-[18px] font-mono text-[#869397] uppercase bg-black/80 px-4 py-2 border border-[#3d494c]">{cameraError}</p>
                </div>
              )}
              {!permissionGranted && !cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-30">
                  <p className="text-[18px] font-mono text-[#869397] uppercase bg-black/80 px-4 py-2 border border-[#3d494c] animate-pulse">
                    Point camera at Broadcaster screen
                  </p>
                </div>
              )}
              {permissionGranted && !completed && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-30">
                  <p className="text-[18px] font-mono text-[#869397] uppercase bg-black/80 px-4 py-2 border border-[#3d494c]">
                    {totalChunks ? "Scanning..." : "Point camera at Broadcaster screen"}
                  </p>
                </div>
              )}

              <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover opacity-80" muted playsInline />
            </div>
          </section>
          <canvas ref={canvasRef} className="hidden" />

          {/* Telemetry Grid */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-1">
            {/* Completion */}
            <div className="bg-[#131315] border border-[#3d494c] border-b-2 border-b-[#4edea3] p-3 flex flex-col justify-between h-24 relative overflow-hidden hover:bg-[#39393b]/5 transition-colors">
              <span className="text-[11px] font-mono uppercase text-[#bcc9cd]">Completion</span>
              <div className="flex items-end justify-between mt-2">
                <span className="text-[32px] font-mono text-[#4edea3] leading-none">{Math.round(pct)}<span className="text-[18px]">%</span></span>
                <div className="w-8 h-8 relative flex items-center justify-center mb-1">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                    <path className="text-[#2a2a2c]" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4"/>
                    <path style={{color:"#4edea3", filter:"drop-shadow(0 0 2px rgba(78,222,163,0.8))"}} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeDasharray={`${pct}, 100`} strokeWidth="4"/>
                  </svg>
                </div>
              </div>
            </div>

            {/* Integrity */}
            <div className="bg-[#131315] border border-[#3d494c] p-3 flex flex-col justify-between h-24 hover:bg-[#39393b]/5 transition-colors">
              <span className="text-[11px] font-mono uppercase text-[#bcc9cd] flex items-center gap-1">⊞ Integrity</span>
              <div className="mt-2 flex flex-col">
                <span className="text-[32px] font-mono text-[#e5e1e4] leading-none">{receivedCount}</span>
                <span className="text-[11px] font-mono text-[#869397]">/{totalChunks ?? "?"} Chunks</span>
              </div>
            </div>

            {/* Dropped / Missing */}
            <div className="bg-[#131315] border border-[#3d494c] p-3 flex flex-col justify-between h-24 hover:bg-[#39393b]/5 transition-colors">
              <span className="text-[11px] font-mono uppercase text-[#bcc9cd] flex items-center gap-1">⚠ Missing</span>
              <div className="mt-2 flex flex-col">
                <span className="text-[32px] font-mono text-[#353437] leading-none">{missing}</span>
                <span className="text-[11px] font-mono text-[#869397]">Chunks</span>
              </div>
            </div>

            {/* Sync Speed */}
            <div className="bg-[#131315] border border-[#3d494c] border-l-2 border-l-[#4cd7f6] p-3 flex flex-col justify-between h-24 hover:bg-[#39393b]/5 transition-colors">
              <span className="text-[11px] font-mono uppercase text-[#4cd7f6] flex items-center gap-1">⚡ Sync Speed</span>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-[32px] font-mono text-[#4cd7f6] leading-none" style={{textShadow:"0 0 4px rgba(76,215,246,0.5)"}}>{scanFps}</span>
                <span className="text-[11px] font-mono text-[#4cd7f6]">FPS</span>
              </div>
            </div>
          </section>

          {/* Progress Bar */}
          <div className="w-full bg-[#2a2a2c] h-1 border border-[#3d494c] relative">
            <div className="absolute top-0 left-0 h-full bg-[#4edea3] transition-[width] duration-300" style={{width:`${pct}%`, boxShadow:"0 0 8px rgba(78,222,163,0.6)"}} />
            <div className="absolute top-[-2px] h-[5px] w-[2px] bg-white animate-ping transition-[left] duration-300" style={{left:`${pct}%`}} />
          </div>

          {/* Error */}
          {errorMsg && (
            <div className="bg-[#93000a]/20 border border-[#ffb4ab]/30 p-3 text-[11px] font-mono text-[#ffb4ab]">{errorMsg}</div>
          )}
        </div>

        {/* Right Column – Data Stream Consistency Matrix */}
        <div className="lg:col-span-4 bg-[#131315] border border-[#3d494c] flex flex-col" style={{height:"calc(50vh + 112px)", minHeight:"500px"}}>
          <div className="p-3 border-b border-[#3d494c] flex justify-between items-center bg-[#1c1b1d]">
            <h3 className="text-[11px] font-mono text-[#e5e1e4] uppercase flex items-center gap-2">
              ⊟ Data Stream Consistency
            </h3>
            {totalChunks && !completed && (
              <span className="text-[11px] font-mono text-[#4edea3] animate-pulse">SYNCING...</span>
            )}
            {completed && <span className="text-[11px] font-mono text-[#4edea3]">COMPLETE</span>}
          </div>

          {/* Legend */}
          <div className="p-2 border-b border-[#3d494c] bg-[#131315] flex gap-4 text-[11px] font-mono">
            <div className="flex items-center gap-1 text-[#869397]"><div className="w-3 h-3 border border-[#3d494c]" /> Missing</div>
            <div className="flex items-center gap-1 text-[#4edea3]"><div className="w-3 h-3 bg-[#4edea3]" /> Captured</div>
          </div>

          {/* Matrix */}
          <div className="flex-1 p-3 overflow-y-auto bg-[#0e0e10]">
            {bitmask.length > 0 ? (
              <div className="grid grid-cols-12 gap-[2px] w-full">
                {bitmask.map((recv, i) => (
                  <div
                    key={i}
                    title={`Chunk 0x${(i + 0x1000).toString(16).toUpperCase()} ${recv ? "✓" : "MISSING"}`}
                    className={cn("w-full aspect-square transition-colors duration-200", recv ? "" : "border border-[#3d494c] opacity-50")}
                    style={recv ? {backgroundColor:"#4edea3", boxShadow:"0 0 4px rgba(78,222,163,0.5)"} : undefined}
                  />
                ))}
              </div>
            ) : (
              <p className="text-[11px] font-mono text-[#3d494c] text-center mt-8">Awaiting transmission...</p>
            )}
          </div>

          {/* Terminal Log Footer */}
          <div className="p-2 border-t border-[#3d494c] bg-[#1c1b1d] h-24 overflow-hidden relative flex flex-col justify-end pb-2">
            <div className="absolute inset-x-0 top-0 h-4 z-10 pointer-events-none" style={{background:"linear-gradient(to bottom,#1c1b1d,transparent)"}} />
            <div className="font-mono text-[11px] text-[#3d494c] flex flex-col gap-1">
              {terminalLog.map((line, i) => (
                <div key={i} className={cn(line.includes("verified") || line.includes("reassembled") ? "text-[#4edea3]" : line.includes("ERROR") ? "text-[#ffb4ab]" : "")}>
                  {line}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 w-full bg-[#131315] border-t border-[#3d494c] flex justify-around items-center h-16 z-50">
        <Link href="/send" className="flex flex-col items-center justify-center w-full h-full text-[#bcc9cd] hover:text-[#4cd7f6] transition-colors">
          <span className="text-xl mb-1">📡</span>
          <span className="text-[10px] font-mono uppercase">Broadcast</span>
        </Link>
        <span className="flex flex-col items-center justify-center w-full h-full text-[#4cd7f6] border-t-2 border-[#4cd7f6] bg-[#4cd7f6]/5">
          <span className="text-xl mb-1">📷</span>
          <span className="text-[10px] font-mono uppercase" style={{textShadow:"0 0 4px rgba(76,215,246,0.5)"}}>Collect</span>
        </span>
      </nav>
      <div className="h-16 md:hidden" />

      {/* Completion Modal */}
      {showModal && completed && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#131315] border border-[#4cd7f6] max-w-md w-full p-6 flex flex-col gap-6" style={{boxShadow:"0 0 20px rgba(76,215,246,0.3)"}}>
            <div className="flex flex-col items-center text-center gap-2">
              <div className="w-16 h-16 border-2 border-[#4edea3] flex items-center justify-center mb-2">
                <span className="text-[#4edea3] text-4xl">✓</span>
              </div>
              <h3 className="text-2xl font-bold text-[#4cd7f6] uppercase tracking-tight">File Successfully Reassembled &amp; Verified</h3>
            </div>
            <div className="bg-[#0e0e10] border border-[#3d494c] p-4 font-mono text-[11px] flex flex-col gap-2">
              <div className="flex justify-between"><span className="text-[#869397]">File:</span><span className="text-[#e5e1e4]">{fileName}</span></div>
              <div className="flex justify-between"><span className="text-[#869397]">Chunks:</span><span className="text-[#e5e1e4]">{totalChunks}</span></div>
              <div className="flex justify-between"><span className="text-[#869397]">CRC32 Integrity:</span><span className="text-[#4edea3]">Passed</span></div>
            </div>

            {/* Preview */}
            {mimeType.startsWith("image/") && <img src={blobUrl} alt="Received" className="max-w-full max-h-48 object-contain mx-auto border border-[#3d494c]" />}
            {mimeType.startsWith("video/") && <video src={blobUrl} controls className="w-full border border-[#3d494c]" />}
            {mimeType.startsWith("audio/") && <audio src={blobUrl} controls className="w-full" />}

            <div className="flex flex-col gap-2">
              <a href={blobUrl} download={fileName}
                className="w-full bg-[#4cd7f6] text-[#003640] py-3 font-mono text-[11px] uppercase tracking-widest hover:bg-[#acedff] transition-colors flex items-center justify-center gap-2 text-center">
                ⬇ Download File
              </a>
              <button onClick={() => { setShowModal(false); reset(); }}
                className="w-full border border-[#3d494c] text-[#bcc9cd] py-3 font-mono text-[11px] uppercase tracking-widest hover:bg-[#39393b]/10 transition-colors">
                Close / Scan Another
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

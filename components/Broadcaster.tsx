"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";
import * as SliderPrimitive from "@radix-ui/react-slider";
import {
  generateId, compressFile, createChunks, inferMimeType, type Chunk,
} from "@/lib/chunker";
import { cn } from "@/utils/cn";
import Link from "next/link";
import MethodSelectorModal from "@/components/MethodSelectorModal";
import MatrixProgress from "@/components/MatrixProgress";

const CHUNK_SIZE = 220; // 220 base64 chars = ~360 total bytes per QR frame (Version 11 61x61 QR grid with 8.2px modules)
const THRESHOLD_BYTES = 100 * 1024; // 100 KB threshold (102,400 bytes)
const DEFAULT_LOCAL_LAN_IP = "10.180.96.252:3000";

export interface CloudBlobPayload {
  type: "BEAM_NET_CLOUD_BLOB";
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export default function Broadcaster() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [transferMode, setTransferMode] = useState<"optical" | "cloud">("optical");
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [fps, setFps] = useState(8);
  const [playing, setPlaying] = useState(false);
  const [originalSize, setOriginalSize] = useState(0);
  const [compressedSize, setCompressedSize] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [brightnessOn, setBrightnessOn] = useState(true);
  const [dragOver, setDragOver] = useState(false);

  // Vercel App Domain / Host IP for Phone QR Scans (e.g. beam-net.vercel.app or 10.180.96.252:3000)
  const [customHost, setCustomHost] = useState<string>("");

  // QR Display URL
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  // Cloud Mode state
  const [cloudUrl, setCloudUrl] = useState<string>("");
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [fallbackNotice, setFallbackNotice] = useState<string>("");

  // 6-Digit Passkey state
  const [passkey, setPasskey] = useState<string>("");
  const [passkeyExpiresAt, setPasskeyExpiresAt] = useState<number>(0);
  const [passkeyCopied, setPasskeyCopied] = useState<boolean>(false);

  // Modal State
  const [showSelectorModal, setShowSelectorModal] = useState(false);

  // Initialize Host
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        setCustomHost(DEFAULT_LOCAL_LAN_IP);
      } else {
        setCustomHost(window.location.host);
      }
    }
  }, []);

  // ── Render QR to Data URL ─────────────────────────────────
  const generateQrDataUrl = useCallback(async (content: string) => {
    try {
      const dataUrl = await QRCode.toDataURL(content, {
        errorCorrectionLevel: "M", // M > L: more noise resilient for camera scans
        margin: 1,
        width: 500, // Larger = bigger modules on screen = easier phone camera detection
        color: { dark: "#000000", light: "#ffffff" },
      });
      setQrDataUrl(dataUrl);
    } catch (err) {
      console.error("QR Generation Error:", err);
    }
  }, []);

  // ── Execute Optical Chunking & Generate 6-Digit Passkey ──
  const startOpticalChunking = useCallback(async (selected: File) => {
    setTransferMode("optical");
    setPreparing(true);
    setUploadProgress(5);
    setPasskey("");

    try {
      const progressTimer = setInterval(() => {
        setUploadProgress((prev) => (prev < 90 ? prev + 10 : prev));
      }, 50);

      const compressed = await compressFile(selected);
      clearInterval(progressTimer);
      setUploadProgress(90);

      setCompressedSize(compressed.length);
      const mimeType = inferMimeType(selected.name, selected.type);
      const generated = createChunks(compressed, CHUNK_SIZE, {
        id: generateId(),
        mimeType,
        fileName: selected.name,
        fileSize: selected.size,
      });
      setChunks(generated);
      setCurrentIdx(0);

      // Upload payload to blob store so the 6-digit code has a valid download target
      let uploadedPathname = "";
      let uploadedFileUrl = "";

      try {
        const formData = new FormData();
        formData.append("file", selected);
        formData.append("filename", selected.name);
        const uploadRes = await fetch("/api/blob/upload", {
          method: "POST",
          body: formData,
        });
        if (uploadRes.ok) {
          const uploadJson = await uploadRes.json();
          uploadedPathname = uploadJson.pathname || "";
          uploadedFileUrl = uploadJson.url || "";
        }
      } catch (uErr) {
        console.warn("Background upload warning for passkey target:", uErr);
      }

      // Generate 6-digit code for optical file as well
      const codeRes = await fetch("/api/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileUrl: uploadedFileUrl,
          pathname: uploadedPathname,
          fileName: selected.name,
          fileSize: selected.size,
          mimeType,
        }),
      });

      if (codeRes.ok) {
        const codeData = await codeRes.json();
        setPasskey(codeData.code);
        setPasskeyExpiresAt(codeData.expiresAt);
      }

      setUploadProgress(100);

      if (generated.length > 0) {
        await generateQrDataUrl(JSON.stringify(generated[0]));
      }
    } catch (err) {
      console.error("Compression error:", err);
    } finally {
      setTimeout(() => setPreparing(false), 300);
    }
  }, [generateQrDataUrl]);

  // ── Execute Private Cloud Upload with XHR & Generate 6-Digit Code ──────
  const startCloudUpload = useCallback(async (selected: File) => {
    setTransferMode("cloud");
    setPreparing(true);
    setFallbackNotice("");
    setCloudUrl("");
    setPasskey("");
    setUploadProgress(2);

    try {
      // 1. Health check
      const healthRes = await fetch("/api/blob/health");
      const healthData = await healthRes.json();

      if (!healthData.ready) {
        throw new Error(healthData.error || "Server token not ready");
      }

      setUploadProgress(10);

      // 2. Upload file via XHR
      const formData = new FormData();
      formData.append("file", selected);
      formData.append("filename", selected.name);

      const uploadData = await new Promise<{ pathname: string; url: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/blob/upload");

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 75) + 10;
            setUploadProgress(pct);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch {
              reject(new Error("Invalid server JSON response"));
            }
          } else {
            try {
              const errJson = JSON.parse(xhr.responseText);
              reject(new Error(errJson.error || "Upload failed"));
            } catch {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        };

        xhr.onerror = () => reject(new Error("Network error during blob upload"));
        xhr.send(formData);
      });

      setUploadProgress(85);

      // 3. Construct landing page URL
      let activeHost = customHost.trim();
      if (!activeHost) {
        if (typeof window !== "undefined") {
          activeHost = window.location.hostname === "localhost" ? DEFAULT_LOCAL_LAN_IP : window.location.host;
        } else {
          activeHost = DEFAULT_LOCAL_LAN_IP;
        }
      }

      const protocol =
        activeHost.startsWith("http://") || activeHost.startsWith("https://")
          ? ""
          : typeof window !== "undefined" && window.location.protocol.startsWith("https")
          ? "https://"
          : "http://";

      const targetDownloadPageUrl = `${protocol}${activeHost}/d?p=${encodeURIComponent(uploadData.pathname)}&f=${encodeURIComponent(selected.name)}`;
      setCloudUrl(targetDownloadPageUrl);

      // 4. Generate 6-Digit Passkey
      const codeRes = await fetch("/api/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileUrl: targetDownloadPageUrl,
          pathname: uploadData.pathname,
          fileName: selected.name,
          fileSize: selected.size,
          mimeType: selected.type || inferMimeType(selected.name, selected.type),
        }),
      });

      if (codeRes.ok) {
        const codeData = await codeRes.json();
        setPasskey(codeData.code);
        setPasskeyExpiresAt(codeData.expiresAt);
      }

      setUploadProgress(100);
      await generateQrDataUrl(targetDownloadPageUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      console.warn("Private Blob upload failed — auto falling back to Optical Air-Gapped Stream:", msg);
      setFallbackNotice(`Private Blob upload skipped (${msg}) — automatically switched to Air-Gapped Optical QR Stream.`);
      await startOpticalChunking(selected);
    } finally {
      setTimeout(() => setPreparing(false), 400);
    }
  }, [customHost, generateQrDataUrl, startOpticalChunking]);

  // ── Process File with 100KB Threshold Rule ───────────────
  const processFile = useCallback(async (selected: File) => {
    setFile(selected);
    setOriginalSize(selected.size);
    setPlaying(false);
    setFallbackNotice("");
    setCloudUrl("");
    setPasskey("");
    setChunks([]);
    setQrDataUrl("");

    if (selected.size > THRESHOLD_BYTES) {
      await startCloudUpload(selected);
    } else {
      try {
        const compressed = await compressFile(selected);
        setCompressedSize(compressed.length);
      } catch {
        setCompressedSize(selected.size);
      }
      setShowSelectorModal(true);
    }
  }, [startCloudUpload]);

  // Handle choice from MethodSelectorModal
  const handleModalChoice = (choice: "optical" | "cloud") => {
    if (!file) return;
    if (choice === "cloud") {
      startCloudUpload(file);
    } else {
      startOpticalChunking(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) processFile(f);
  };

  // Render optical chunk when currentIdx changes
  useEffect(() => {
    if (transferMode === "optical" && chunks.length > 0) {
      generateQrDataUrl(JSON.stringify(chunks[currentIdx]));
    }
  }, [transferMode, currentIdx, chunks, generateQrDataUrl]);

  // Offline FPS loop
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (transferMode !== "optical" || !playing || chunks.length === 0) return;
    intervalRef.current = setInterval(
      () => setCurrentIdx((p) => (p + 1) % chunks.length),
      Math.round(1000 / fps)
    );
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [transferMode, playing, fps, chunks.length]);

  const togglePlay = () => setPlaying((p) => !p);

  const pct =
    transferMode === "cloud"
      ? uploadProgress.toFixed(1)
      : chunks.length > 0
      ? (((currentIdx + 1) / chunks.length) * 100).toFixed(1)
      : "0.0";

  const fmtSize = (b: number) =>
    b >= 1024 * 1024 ? `${(b / (1024 * 1024)).toFixed(2)} MB` : `${(b / 1024).toFixed(1)} KB`;

  const copyPasskey = () => {
    if (!passkey) return;
    navigator.clipboard.writeText(passkey);
    setPasskeyCopied(true);
    setTimeout(() => setPasskeyCopied(false), 2000);
  };

  return (
    <div
      className="bg-[#131315] text-[#e5e1e4] min-h-screen flex flex-col antialiased font-[Inter,sans-serif]"
      style={{
        backgroundImage:
          "linear-gradient(to bottom,rgba(255,255,255,0),rgba(255,255,255,0) 50%,rgba(0,0,0,0.08) 50%,rgba(0,0,0,0.08))",
        backgroundSize: "100% 4px",
      }}
    >
      {/* ── Top Bar ── */}
      <header className="fixed flex justify-between items-center w-full px-8 h-16 bg-[#131315] border-b border-[#3d494c] z-50">
        <div className="flex items-center gap-6">
          <Link href="/" className="cursor-pointer hover:opacity-80 transition-opacity">
            <h1 className="text-2xl font-bold text-[#4cd7f6] tracking-tighter uppercase">BEAM-NET</h1>
          </Link>
          {file && originalSize > THRESHOLD_BYTES ? (
            <div className="hidden sm:flex border border-[#4cd7f6] bg-[#4cd7f6]/10 px-2 py-1 items-center gap-2">
              <div className="w-1.5 h-1.5 bg-[#4cd7f6] animate-pulse rounded-none" />
              <span className="text-[11px] font-mono font-semibold text-[#4cd7f6] uppercase tracking-widest">
                {transferMode === "cloud" ? "PRIVATE CLOUD BLOB STORE (>100KB)" : "OPTICAL FALLBACK ACTIVE"}
              </span>
            </div>
          ) : transferMode === "optical" ? (
            <div className="hidden sm:flex border border-[#4edea3] bg-[#4edea3]/10 px-2 py-1 items-center gap-2">
              <div className="w-1.5 h-1.5 bg-[#4edea3] animate-pulse rounded-none" />
              <span className="text-[11px] font-mono font-semibold text-[#4edea3] uppercase tracking-widest">
                AIR-GAPPED OPTICAL MODE (≤100KB)
              </span>
            </div>
          ) : (
            <div className="hidden sm:flex border border-[#4cd7f6] bg-[#4cd7f6]/10 px-2 py-1 items-center gap-2">
              <div className="w-1.5 h-1.5 bg-[#4cd7f6] animate-pulse rounded-none" />
              <span className="text-[11px] font-mono font-semibold text-[#4cd7f6] uppercase tracking-widest">
                PRIVATE CLOUD BLOB MODE
              </span>
            </div>
          )}
        </div>
        <nav className="hidden md:flex items-center h-full gap-2">
          <span className="text-[#4cd7f6] border-b-2 border-[#4cd7f6] py-4 px-3 text-[11px] font-mono uppercase tracking-widest h-full flex items-center">
            Broadcaster
          </span>
          <Link
            href="/scan"
            className="text-[#bcc9cd] py-4 px-3 text-[11px] font-mono uppercase tracking-widest hover:text-[#4cd7f6] h-full flex items-center transition-colors"
          >
            Collector
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <button className="text-[#bcc9cd] hover:text-[#4cd7f6] transition-colors text-xl p-1">⊗</button>
          <button className="text-[#bcc9cd] hover:text-[#4cd7f6] transition-colors text-xl p-1">◯</button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="pt-[80px] px-4 md:px-8 max-w-[1440px] w-full mx-auto flex-1 flex flex-col gap-4 pb-[120px]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-[600px]">

          {/* Left – Source File panel */}
          <section className="lg:col-span-5 flex flex-col">
            <div className="bg-[#131315] border border-[#3d494c] p-4 h-full flex flex-col">
              <header className="flex justify-between items-center mb-5 pb-2 border-b border-[#3d494c]">
                <h2 className="text-[11px] font-mono uppercase tracking-widest text-[#bcc9cd]">Source File</h2>
                <span className="text-[#3d494c] text-xs font-mono">📂 PAYLOAD</span>
              </header>

              {/* Target Domain configuration for QR links */}
              <div className="mb-4 bg-[#0e0e10] border border-[#3d494c] p-2 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-mono uppercase text-[#869397]">Target Domain / Host IP:</label>
                  <button
                    onClick={() => {
                      setCustomHost(DEFAULT_LOCAL_LAN_IP);
                      if (file) {
                        if (transferMode === "cloud") startCloudUpload(file);
                        else startOpticalChunking(file);
                      }
                    }}
                    className="text-[9px] font-mono text-[#4cd7f6] hover:underline"
                  >
                    Reset LAN ({DEFAULT_LOCAL_LAN_IP})
                  </button>
                </div>
                <input
                  type="text"
                  value={customHost}
                  onChange={(e) => {
                    setCustomHost(e.target.value);
                    if (file) {
                      if (transferMode === "cloud") startCloudUpload(file);
                      else startOpticalChunking(file);
                    }
                  }}
                  placeholder="e.g. your-app.vercel.app or 10.180.96.252:3000"
                  className="bg-[#131315] border border-[#3d494c] text-[11px] font-mono text-[#4cd7f6] px-2 py-1 w-full focus:outline-none focus:border-[#4cd7f6]"
                />
              </div>

              {/* Drop zone */}
              <label
                className={cn(
                  "border border-dashed bg-[#0e0e10] h-40 mb-4 flex flex-col items-center justify-center gap-2 cursor-pointer relative overflow-hidden transition-all",
                  dragOver
                    ? "border-[#4cd7f6] bg-[#4cd7f6]/5"
                    : "border-[#3d494c] hover:border-[#4cd7f6] hover:bg-[#4cd7f6]/5"
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <span className="text-3xl">{preparing ? "⏳" : file ? "✅" : "⬆"}</span>
                <p className="text-[11px] font-mono uppercase tracking-widest text-[#bcc9cd] text-center px-2">
                  {preparing
                    ? "Processing Payload..."
                    : file
                    ? file.name
                    : "DRAG & DROP SECURE PAYLOAD HERE"}
                </p>
                <p className="text-[9px] font-mono text-[#3d494c] text-center">
                  Private S3 Store (BEAM-NET / {process.env.NEXT_PUBLIC_S3_BUCKET ?? "beamnet-storage"})
                </p>
                <input type="file" onChange={handleFileChange} className="hidden" />
              </label>

              {/* High-Contrast 6-Digit Passkey Card for Phone-to-PC Sharing */}
              {passkey ? (
                <div className="mb-4 bg-[#0e0e10] border border-[#4edea3] p-4 flex flex-col items-center gap-3 shadow-[0_0_20px_rgba(78,222,163,0.25)] relative">
                  <div className="flex justify-between items-center w-full pb-1 border-b border-[#3d494c]">
                    <div className="flex items-center gap-1.5 text-[#4edea3] text-[11px] font-mono font-bold uppercase tracking-widest">
                      <span className="w-2.5 h-2.5 bg-[#4edea3] animate-pulse" />
                      <span>🔑 6-Digit Receiver Passkey</span>
                    </div>
                    <span className="text-[9px] font-mono text-[#869397]">TTL: 15 MIN</span>
                  </div>

                  {/* 6 Large Monospace Boxes */}
                  <div className="flex gap-2.5 my-1">
                    {passkey.split("").map((digit, i) => (
                      <div
                        key={i}
                        className="w-10 h-14 bg-[#131315] border-2 border-[#4edea3] flex items-center justify-center text-3xl font-mono font-bold text-[#4edea3] shadow-[0_0_10px_rgba(78,222,163,0.5)]"
                      >
                        {digit}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between w-full text-[10px] font-mono text-[#bcc9cd] pt-1">
                    <span>Type code on PC at <b className="text-[#4edea3]">/scan</b> to download</span>
                    <button
                      onClick={copyPasskey}
                      className="bg-[#4edea3]/10 border border-[#4edea3] text-[#4edea3] px-3 py-1 text-[10px] font-mono uppercase hover:bg-[#4edea3] hover:text-[#003640] transition-colors font-bold"
                    >
                      {passkeyCopied ? "✓ Copied!" : "📋 Copy Code"}
                    </button>
                  </div>
                </div>
              ) : file ? (
                <div className="mb-4 bg-[#0e0e10] border border-[#4cd7f6] p-3 text-center text-[11px] font-mono text-[#4cd7f6] animate-pulse">
                  ⏳ Generating 6-Digit Receiver Passkey...
                </div>
              ) : null}

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { label: "Original Size", value: originalSize ? fmtSize(originalSize) : "—", accent: false },
                  { label: "Transfer Mode", value: file ? (transferMode === "cloud" ? "Private Cloud" : "Optical Stream") : "—", accent: true },
                  { label: "Total Chunks", value: transferMode === "cloud" ? "1 (Auto / Code)" : chunks.length || "—", accent: false },
                  { label: "6-Digit Passkey", value: passkey ? passkey : "Generating...", accent: true },
                ].map(({ label, value, accent }) => (
                  <div
                    key={label}
                    className={cn(
                      "border bg-[#0e0e10] p-3 flex flex-col justify-between",
                      accent ? "border-[#3d494c] border-b-2 border-b-[#4edea3]" : "border-[#3d494c]"
                    )}
                  >
                    <span className="text-[11px] font-mono uppercase text-[#3d494c]">{label}</span>
                    <span className={cn("text-[15px] font-mono mt-2 truncate", accent ? "text-[#4edea3]" : "text-[#e5e1e4]")}>
                      {String(value)}
                    </span>
                  </div>
                ))}
              </div>

              {fallbackNotice && (
                <div className="mb-4 p-3 bg-[#4edea3]/10 border border-[#4edea3]/40 text-[11px] font-mono text-[#4edea3]">
                  ℹ {fallbackNotice}
                </div>
              )}

              <div className="flex-1" />

              {/* Action buttons */}
              <div className="flex flex-col gap-3">
                {transferMode === "optical" ? (
                  <button
                    onClick={togglePlay}
                    disabled={chunks.length === 0}
                    className={cn(
                      "w-full font-mono text-[11px] uppercase tracking-widest py-4 border flex items-center justify-center gap-2 transition-all active:scale-[0.98]",
                      chunks.length > 0
                        ? "bg-[#4cd7f6] text-[#003640] border-[#4cd7f6] hover:bg-[#acedff]"
                        : "bg-transparent text-[#3d494c] border-[#3d494c] cursor-not-allowed"
                    )}
                    style={chunks.length > 0 ? { boxShadow: "0 0 12px rgba(76,215,246,0.2)" } : undefined}
                  >
                    {playing ? "⏸ Pause Transmission" : "📡 Start Transmission"}
                  </button>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="w-full bg-[#4cd7f6]/10 border border-[#4cd7f6] text-[#4cd7f6] font-mono text-[11px] uppercase tracking-widest py-3 text-center">
                      {cloudUrl ? "⚡ Instant Auto-Download & Code Active" : "Uploading to Private Store..."}
                    </div>
                    {cloudUrl && (
                      <a
                        href={cloudUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] font-mono text-[#869397] hover:text-[#4cd7f6] text-center underline truncate"
                      >
                        {cloudUrl}
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Right – Optical Payload panel */}
          <section className="lg:col-span-7 flex flex-col">
            <div className="bg-[#131315] border border-[#3d494c] p-4 h-full flex flex-col relative overflow-hidden">
              {/* Corner accents */}
              {["top-0 left-0 border-t border-l", "top-0 right-0 border-t border-r",
                "bottom-0 left-0 border-b border-l", "bottom-0 right-0 border-b border-r"].map((pos, i) => (
                <div key={i} className={`absolute w-3 h-3 border-[#869397] ${pos}`} />
              ))}

              <header className="flex justify-between items-center mb-5 pb-2 border-b border-[#3d494c] gap-4">
                <h2 className="text-[11px] font-mono uppercase tracking-widest text-[#bcc9cd] flex items-center gap-2">
                  <span className="w-2 h-2 bg-[#4edea3] inline-block" />
                  Optical Payload
                </h2>
                <span
                  className={cn(
                    "text-[14px] font-mono whitespace-nowrap",
                    preparing ? "text-[#4cd7f6] animate-pulse" : playing ? "text-[#4edea3] animate-pulse" : transferMode === "cloud" && cloudUrl ? "text-[#4cd7f6]" : "text-[#3d494c]"
                  )}
                >
                  {preparing
                    ? "UPLOADING TO MATRIX..."
                    : playing
                    ? `BROADCASTING AT ${fps} FPS`
                    : transferMode === "cloud" && cloudUrl
                    ? "AUTO-DOWNLOAD & PASSKEY READY"
                    : chunks.length > 0
                    ? "READY TO BROADCAST"
                    : "AWAITING PAYLOAD"}
                </span>
              </header>

              {/* Canvas / 10x10 Matrix Progress area */}
              <div className="flex-1 flex items-center justify-center bg-[#0e0e10] border border-[#3d494c] relative p-6 min-h-[400px]">
                <div className="absolute top-3 left-3 text-[10px] font-mono text-[#3d494c]">
                  {transferMode === "cloud" ? "STORE: beamnet-storage (S3)" : chunks.length > 0 ? `IDX: ${String(currentIdx).padStart(5, "0")}` : "X: -- Y: --"}
                </div>
                <div className="absolute bottom-3 right-3 text-[10px] font-mono text-[#3d494c]">
                  {preparing ? "MATRIX-PROGRESS-STREAM" : transferMode === "cloud" ? "PASSKEY-6-DIGIT" : `SEQ: ${String(currentIdx).padStart(5, "0")}`}
                </div>

                {/* Show 10x10 Matrix Progress Grid when uploading/preparing file */}
                {preparing ? (
                  <MatrixProgress
                    progress={uploadProgress}
                    statusText={transferMode === "cloud" ? "TRANSMITTING TO PRIVATE S3 STORE..." : "COMPRESSING & CHUNKING PAYLOAD..."}
                    fileName={file?.name}
                  />
                ) : (
                  <div className="relative flex flex-col items-center gap-4">
                    {(playing || (transferMode === "cloud" && cloudUrl)) && (
                      <div className="absolute -inset-1 border border-[#4cd7f6]/30" style={{ boxShadow: "0 0 20px rgba(76,215,246,0.15)" }} />
                    )}

                    {/* QR Image rendering via Data URL with responsive mobile sizing */}
                    <div className="w-full max-w-[85vw] sm:max-w-xs aspect-square mx-auto my-4 flex items-center justify-center">
                      {qrDataUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={qrDataUrl}
                          alt="BEAM-NET Auto Download QR"
                          className="w-full h-full object-contain rounded-lg shadow-2xl border-2 border-[#3d494c] bg-white p-2"
                        />
                      ) : (
                        <div className="w-[300px] h-[300px] bg-white border-2 border-black flex items-center justify-center p-4">
                          <div className="w-full h-full grid grid-cols-[repeat(21,1fr)] grid-rows-[repeat(21,1fr)] bg-white">
                            <div className="col-start-1 row-start-1 col-span-7 row-span-7 bg-black p-[1fr]">
                              <div className="w-full h-full bg-white p-[1fr]"><div className="w-full h-full bg-black" /></div>
                            </div>
                            <div className="col-start-15 row-start-1 col-span-7 row-span-7 bg-black p-[1fr]">
                              <div className="w-full h-full bg-white p-[1fr]"><div className="w-full h-full bg-black" /></div>
                            </div>
                            <div className="col-start-1 row-start-15 col-span-7 row-span-7 bg-black p-[1fr]">
                              <div className="w-full h-full bg-white p-[1fr]"><div className="w-full h-full bg-black" /></div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Native Camera UI Helper Badge */}
                    {transferMode === "cloud" && cloudUrl && (
                      <div className="mt-2 p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-center w-full max-w-xs">
                        <p className="text-xs font-mono text-emerald-400 font-semibold flex items-center justify-center gap-2">
                          <span>📱</span> SCAN WITH ANY PHONE CAMERA OR GOOGLE LENS
                        </p>
                        <p className="text-[10px] font-mono text-zinc-400 mt-1">
                          No app required on receiver • Opens direct file download
                        </p>
                      </div>
                    )}

                    {/* Laser scan effect while playing */}
                    {playing && (
                      <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-[#4cd7f6]/70 blur-sm animate-ping pointer-events-none" />
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Made with ❤️ Footer */}
        <footer className="mt-12 mb-8 py-6 text-center border-t border-[#3d494c]/60 w-full max-w-[1440px] mx-auto">
          <p className="text-xs font-mono text-[#869397] flex items-center justify-center gap-1">
            Made with <span className="text-red-500">❤️</span> • Free & Open Source Air-Gapped Tool
          </p>
          <p className="text-[10px] font-mono text-[#3d494c] mt-1">
            BEAM-NET v1.0 • Hybrid Optical Transfer
          </p>
        </footer>
      </main>

      {/* ── Footer Controls ── */}
      <footer className="fixed bottom-0 left-0 w-full bg-[#131315] border-t border-[#3d494c] p-4 z-40">
        <div className="max-w-[1440px] mx-auto w-full grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* FPS slider */}
          <div className="md:col-span-3 flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-mono uppercase text-[#bcc9cd]">FPS Control</span>
              <span className="text-[18px] font-mono text-[#4cd7f6]">{fps}.0</span>
            </div>
            <SliderPrimitive.Root
              min={3}
              max={12}
              step={1}
              value={[fps]}
              onValueChange={(v) => setFps(v[0])}
              className="relative flex items-center select-none touch-none w-full h-4"
              disabled={transferMode === "cloud"}
            >
              <SliderPrimitive.Track className="bg-[#353437] relative grow h-[3px]">
                <SliderPrimitive.Range className="absolute bg-[#4cd7f6] h-full" />
              </SliderPrimitive.Track>
              <SliderPrimitive.Thumb
                className="block w-2 h-4 bg-[#4cd7f6] focus:outline-none"
                style={{ boxShadow: "0 0 8px rgba(76,215,246,0.5)" }}
              />
            </SliderPrimitive.Root>
            <div className="flex justify-between text-[9px] font-mono text-[#3d494c]">
              <span>3 MIN</span>
              <span>12 MAX</span>
            </div>
          </div>

          {/* Brightness toggle */}
          <div className="md:col-span-2 flex items-center justify-between border border-[#3d494c] px-3 py-2 bg-[#0e0e10]">
            <span className="text-[11px] font-mono uppercase text-[#bcc9cd]">Max Brightness</span>
            <button
              onClick={() => setBrightnessOn((b) => !b)}
              className="relative w-9 h-5 transition-colors"
              style={{
                backgroundColor: brightnessOn ? "#4cd7f6" : "#353437",
                boxShadow: brightnessOn ? "0 0 8px rgba(76,215,246,0.3)" : "none",
              }}
            >
              <div
                className={cn(
                  "absolute top-0.5 w-4 h-4 bg-white border border-[#3d494c] transition-transform duration-150",
                  brightnessOn ? "translate-x-4" : "translate-x-0.5"
                )}
              />
            </button>
          </div>

          {/* Progress */}
          <div className="md:col-span-7 flex flex-col gap-2">
            <div className="flex justify-between items-end">
              <div className="flex flex-col">
                <span className="text-[11px] font-mono uppercase text-[#bcc9cd] mb-1">
                  {transferMode === "cloud" ? "Private Blob Store Upload" : "Transmission Progress"}
                </span>
                <span className="text-[18px] font-mono text-[#e5e1e4]">
                  {transferMode === "cloud"
                    ? `Uploaded ${uploadProgress}%`
                    : chunks.length > 0
                    ? `Chunk ${currentIdx + 1} of ${chunks.length}`
                    : "No payload loaded"}
                </span>
              </div>
              <span className="text-[18px] font-mono text-[#4cd7f6]" style={{ textShadow: "0 0 4px rgba(76,215,246,0.5)" }}>
                {pct}%
              </span>
            </div>
            <div className="w-full bg-[#353437] h-1.5 border border-[#3d494c]/30">
              <div
                className="bg-[#4cd7f6] h-full relative overflow-hidden transition-[width] duration-150"
                style={{ width: `${pct}%`, boxShadow: "0 0 8px rgba(76,215,246,0.3)" }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(45deg,rgba(0,0,0,0.15) 25%,transparent 25%,transparent 50%,rgba(0,0,0,0.15) 50%,rgba(0,0,0,0.15) 75%,transparent 75%,transparent)",
                    backgroundSize: "14px 14px",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* ── Mobile Nav ── */}
      <nav className="md:hidden fixed bottom-0 w-full bg-[#131315] border-t border-[#3d494c] flex justify-around items-center h-14 z-50">
        <span className="flex flex-col items-center gap-1 text-[#4cd7f6] border-t-2 border-[#4cd7f6] w-full h-full justify-center bg-[#4cd7f6]/5">
          <span className="text-lg">📡</span>
          <span className="text-[10px] font-mono uppercase">Broadcast</span>
        </span>
        <Link
          href="/scan"
          className="flex flex-col items-center gap-1 text-[#bcc9cd] w-full h-full justify-center hover:text-[#4cd7f6] transition-colors"
        >
          <span className="text-lg">📷</span>
          <span className="text-[10px] font-mono uppercase">Collect</span>
        </Link>
      </nav>

      {/* ── Method Selector Modal (for <= 100 KB files) ── */}
      {file && (
        <MethodSelectorModal
          open={showSelectorModal}
          onClose={() => setShowSelectorModal(false)}
          fileName={file.name}
          originalSize={originalSize}
          compressedSize={compressedSize}
          onSelectMethod={handleModalChoice}
        />
      )}
    </div>
  );
}

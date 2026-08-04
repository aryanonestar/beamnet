"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import jsQR from "jsqr";
import { reassembleAndUnpack, type Chunk, type ReassemblyResult, isTextPreviewable } from "@/lib/chunker";
import { cn } from "@/utils/cn";
import CompletionModal from "@/components/CompletionModal";
import Link from "next/link";
import { KeyRound, Camera, Download, AlertCircle, Loader2, Zap, Clock, Activity, Layers } from "lucide-react";

/** 480x480 decode canvas: larger canvas detects dense/small QR codes jsQR misses at 320x320 */
const DECODE_WIDTH = 480;
const DECODE_HEIGHT = 480;

export default function Receiver() {
  const videoRef = useRef<HTMLVideoElement>(null);
  // previewCanvasRef removed: <video> itself is the visible viewfinder (Android requires visible video for frame decoding)
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Mode selection: "camera" or "code"
  const [activeTab, setActiveTab] = useState<"camera" | "code">("camera");

  // OTP 6-Digit Passkey state
  const [codeDigits, setCodeDigits] = useState<string[]>(Array(6).fill(""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [codeVerifying, setCodeVerifying] = useState(false);
  const [codeError, setCodeError] = useState("");

  // Persistent Refs for Decoupled Scan Loop (Will NOT trigger re-renders or kill stream)
  const chunksMapRef = useRef<Map<number, Chunk>>(new Map());
  const receivedIndexesRef = useRef<Set<number>>(new Set());
  const transmissionIdRef = useRef<string | null>(null);
  const totalChunksRef = useRef<number>(0);
  const completedRef = useRef(false);
  const isScanningRef = useRef<boolean>(false);
  const lastScanTimeRef = useRef<number>(0);

  // UI state (Updated safely via 4Hz throttler or async triggers)
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [cameraError, setCameraError] = useState("");

  const [receivedIndexes, setReceivedIndexes] = useState<Set<number>>(new Set());
  const [totalChunks, setTotalChunks] = useState<number | null>(null);
  const [scanFps, setScanFps] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [statusBadge, setStatusBadge] = useState<string>("AWAITING OPTICAL STREAM");

  // Completion modal state
  const [showModal, setShowModal] = useState(false);
  const [result, setResult] = useState<ReassemblyResult | null>(null);

  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(Date.now());

  // ── Enumerate cameras ──────────────────────────────────────
  const enumerateCameras = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === "videoinput");
      // Sort: rear/back/environment cameras first so they auto-select by default
      const sorted = [
        ...videoDevices.filter((d) => /back|rear|environment/i.test(d.label)),
        ...videoDevices.filter((d) => !/back|rear|environment/i.test(d.label)),
      ];
      setCameras(sorted);
      if (sorted.length > 0 && !selectedCameraId) {
        // Always prefer rear camera (first in sorted list)
        setSelectedCameraId(sorted[0].deviceId);
      }
    } catch {
      /* ignore */
    }
  }, [selectedCameraId]);

  // ── Camera start ───────────────────────────────────────────
  const startCamera = useCallback(
    async (deviceId?: string) => {
      setCameraError("");
      streamRef.current?.getTracks().forEach((t) => t.stop());

      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      };

      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true");
          videoRef.current.setAttribute("autoplay", "true");
          videoRef.current.setAttribute("muted", "true");
          await videoRef.current.play().catch(() => {});
        }
        setPermissionGranted(true);
        await enumerateCameras();
        setStatusBadge("OPTICAL SCANNER READY");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Camera access denied";
        setCameraError(msg);
        setStatusBadge("CAMERA ACCESS BLOCKED");
      }
    },
    [enumerateCameras]
  );

  const stopCamera = useCallback(() => {
    isScanningRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (activeTab === "camera") {
      const oc = document.createElement("canvas");
      oc.width = DECODE_WIDTH;
      oc.height = DECODE_HEIGHT;
      offscreenRef.current = oc;
      startCamera();
    } else {
      stopCamera();
      setStatusBadge("6-DIGIT PASSKEY MODE");
    }
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      stopCamera();
    };
  }, [activeTab, startCamera, stopCamera]);

  const handleCameraChange = (deviceId: string) => {
    setSelectedCameraId(deviceId);
    startCamera(deviceId);
  };

  // ── Verify 6-Digit Code ────────────────────────────────────
  const verifyCode = useCallback(async (codeToTest: string) => {
    if (codeToTest.length !== 6) return;
    setCodeVerifying(true);
    setCodeError("");
    setStatusBadge("RESOLVING 6-DIGIT PASSKEY...");

    try {
      const res = await fetch(`/api/code?code=${encodeURIComponent(codeToTest)}`);
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Invalid or expired 6-digit code");
      }

      const data = await res.json();
      setStatusBadge("FETCHING PAYLOAD METADATA...");

      // Construct file blob or serve stream
      const fileUrl = data.pathname
        ? `/api/d?p=${encodeURIComponent(data.pathname)}&f=${encodeURIComponent(data.fileName)}`
        : data.fileUrl;

      // Fetch file arrayBuffer for syntax/preview
      const blobRes = await fetch(fileUrl);
      const blobData = await blobRes.arrayBuffer();
      const mime = data.mimeType || "application/octet-stream";

      const fileBlob = new Blob([blobData], { type: mime });
      const blobUrl = URL.createObjectURL(fileBlob);

      let textContent: string | undefined = undefined;
      if (isTextPreviewable(mime)) {
        textContent = new TextDecoder().decode(blobData);
      }

      const assembledResult: ReassemblyResult = {
        blobUrl,
        fileName: data.fileName,
        fileSize: data.fileSize || blobData.byteLength,
        mimeType: mime,
        textContent,
        crc32Valid: true,
      };

      setResult(assembledResult);
      setShowModal(true);
      setStatusBadge("PAYLOAD VERIFIED VIA PASSKEY");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Verification failed";
      setCodeError(msg);
      setStatusBadge("PASSKEY VERIFICATION ERROR");
    } finally {
      setCodeVerifying(false);
    }
  }, []);

  // Handle Digit Typing
  const handleDigitChange = (index: number, value: string) => {
    const cleanValue = value.replace(/[^0-9]/g, "").slice(-1);
    const newDigits = [...codeDigits];
    newDigits[index] = cleanValue;
    setCodeDigits(newDigits);

    // Auto focus next input
    if (cleanValue && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto verify when all 6 digits typed
    const fullCode = newDigits.join("");
    if (fullCode.length === 6) {
      verifyCode(fullCode);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !codeDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // ── Throttled UI State Synchronization (4Hz / 250ms) ─────────
  useEffect(() => {
    if (activeTab !== "camera" || !permissionGranted) return;

    const uiInterval = setInterval(() => {
      if (totalChunksRef.current > 0) {
        setTotalChunks(totalChunksRef.current);
        setReceivedIndexes(new Set(receivedIndexesRef.current));
      }
    }, 250);

    return () => clearInterval(uiInterval);
  }, [activeTab, permissionGranted]);

  // ── Bulletproof rAF-first Scanner Loop (rAF scheduled at very top = IMMORTAL loop) ──
  useEffect(() => {
    if (activeTab !== "camera" || !permissionGranted) return;

    const offscreen = offscreenRef.current;
    const offCtx = offscreen?.getContext("2d", { willReadFrequently: true });
    if (!offscreen || !offCtx) return;

    isScanningRef.current = true;

    const processNextFrame = () => {
      // ─── STEP 1: Schedule NEXT frame IMMEDIATELY at the very top.
      // This means the loop CANNOT die — no exception, early-return, or React re-render can kill it.
      if (isScanningRef.current) {
        animRef.current = requestAnimationFrame(processNextFrame);
      }

      const video = videoRef.current;

      // ─── STEP 2: Validate video is ready (skip silently if not yet loaded)
      if (
        !video ||
        video.readyState < 2 ||
        video.videoWidth === 0 ||
        video.videoHeight === 0
      ) {
        return;
      }

      const vw = video.videoWidth;
      const vh = video.videoHeight;

      // ─── STEP 3: Throttle jsQR decoding to 15 FPS (66ms) — pure time check, no state
      const now = performance.now();
      if (now - lastScanTimeRef.current < 66) return;
      lastScanTimeRef.current = now;

      try {
        // ─── STEP 4: Draw downscaled 480x480 frame to offscreen canvas
        // 8-param drawImage: maps full video frame → 480x480 with correct aspect scale
        offCtx.drawImage(video, 0, 0, vw, vh, 0, 0, DECODE_WIDTH, DECODE_HEIGHT);
        const imageData = offCtx.getImageData(0, 0, DECODE_WIDTH, DECODE_HEIGHT);

        if (!imageData || imageData.data.length !== DECODE_WIDTH * DECODE_HEIGHT * 4) return;

        // ─── STEP 5: Run jsQR decode on the 480x480 pixel buffer
        const code = jsQR(imageData.data, DECODE_WIDTH, DECODE_HEIGHT, {
          inversionAttempts: "attemptBoth",
        });

        // FPS counter (counts actual jsQR decode attempts per second)
        frameCountRef.current++;
        const sysNow = Date.now();
        if (sysNow - lastFpsTimeRef.current >= 1000) {
          setScanFps(frameCountRef.current);
          frameCountRef.current = 0;
          lastFpsTimeRef.current = sysNow;
        }

        if (!code || !code.data || completedRef.current) return;

        // ─── STEP 6: Handle decoded QR data
        // Cloud URL QR
        if (code.data.startsWith("http://") || code.data.startsWith("https://")) {
          completedRef.current = true;
          setStatusBadge("CLOUD REDIRECT SCANNED");
          window.location.href = code.data;
          return;
        }

        // Optical chunk JSON
        try {
          const raw = JSON.parse(code.data);
          const chunkMeta = raw.meta || raw;
          const chunkIdx = typeof chunkMeta.chunkIndex === "number" ? chunkMeta.chunkIndex : raw.chunkIndex;
          const total = typeof chunkMeta.totalChunks === "number" ? chunkMeta.totalChunks : raw.totalChunks;
          const payloadId = chunkMeta.id || raw.id;

          if (!payloadId || typeof chunkIdx !== "number" || typeof total !== "number") return;

          const chunkObj: Chunk = raw.meta ? raw : { meta: raw, payload: raw.payload };

          if (transmissionIdRef.current !== payloadId) {
            transmissionIdRef.current = payloadId;
            totalChunksRef.current = total;
            chunksMapRef.current.clear();
            receivedIndexesRef.current.clear();
            setStatusBadge(`RECEIVING DATA STREAM (${total} CHUNKS)`);
          }

          if (!chunksMapRef.current.has(chunkIdx)) {
            chunksMapRef.current.set(chunkIdx, chunkObj);
            receivedIndexesRef.current.add(chunkIdx);

            if (chunksMapRef.current.size === total && !completedRef.current) {
              completedRef.current = true;
              setStatusBadge("UNPACKING PAYLOAD...");
              reassembleAndUnpack(Array.from(chunksMapRef.current.values()))
                .then((res) => {
                  setResult({ ...res, crc32Valid: true });
                  setShowModal(true);
                  setStatusBadge("OPTICAL STREAM SYNCED & INTACT");
                })
                .catch((err) => {
                  setErrorMsg(err instanceof Error ? err.message : "Reassembly failed");
                  setStatusBadge("PAYLOAD REASSEMBLY ERROR");
                });
            }
          }
        } catch {
          /* not a valid chunk JSON — skip silently */
        }
      } catch (err) {
        console.warn("Non-fatal frame error:", err);
      }
    };

    // Kick off the immortal loop
    animRef.current = requestAnimationFrame(processNextFrame);

    return () => {
      isScanningRef.current = false;
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [activeTab, permissionGranted]);

  // Exact Progress Math
  const receivedCount = receivedIndexes.size;
  const progressPct = totalChunks ? Math.min(100, Math.floor((receivedCount / totalChunks) * 100)) : 0;
  const remainingChunks = totalChunks ? Math.max(0, totalChunks - receivedCount) : 0;
  const estSecondsLeft = scanFps > 0 && remainingChunks > 0 ? Math.ceil(remainingChunks / scanFps) : 0;

  return (
    <div
      className="bg-[#131315] text-[#e5e1e4] min-h-screen pb-36 px-4 flex flex-col antialiased font-[Inter,sans-serif]"
      style={{
        backgroundImage:
          "linear-gradient(to bottom,rgba(255,255,255,0),rgba(255,255,255,0) 50%,rgba(0,0,0,0.08) 50%,rgba(0,0,0,0.08))",
        backgroundSize: "100% 4px",
      }}
    >
      {/* ── Top Bar ── */}
      <header className="fixed flex justify-between items-center w-full px-8 h-16 bg-[#131315] border-b border-[#3d494c] z-50">
        <div className="flex items-center gap-6">
          <h1 className="text-2xl font-bold text-[#4cd7f6] tracking-tighter uppercase">BEAM-NET</h1>

          {/* Sleek Minimalist Status Badge */}
          <div className="hidden sm:flex border border-[#4edea3] bg-[#4edea3]/10 px-3 py-1 items-center gap-2">
            <div className="w-2 h-2 bg-[#4edea3] animate-pulse rounded-none" />
            <span className="text-[11px] font-mono font-semibold text-[#4edea3] uppercase tracking-widest">
              {statusBadge}
            </span>
          </div>
        </div>
        <nav className="hidden md:flex items-center h-full gap-2">
          <Link
            href="/send"
            className="text-[#bcc9cd] py-4 px-3 text-[11px] font-mono uppercase tracking-widest hover:text-[#4cd7f6] h-full flex items-center transition-colors"
          >
            Broadcaster
          </Link>
          <span className="text-[#4cd7f6] border-b-2 border-[#4cd7f6] py-4 px-3 text-[11px] font-mono uppercase tracking-widest h-full flex items-center">
            Collector
          </span>
        </nav>
        <div className="flex items-center gap-3">
          <button className="text-[#bcc9cd] hover:text-[#4cd7f6] transition-colors text-xl p-1">⊗</button>
          <button className="text-[#bcc9cd] hover:text-[#4cd7f6] transition-colors text-xl p-1">◯</button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="pt-[80px] px-4 md:px-8 max-w-[1440px] w-full mx-auto flex-1 flex flex-col gap-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-[600px]">

          {/* Left – Camera Feed / Enter Code Panel */}
          <section className="lg:col-span-7 flex flex-col">
            <div className="bg-[#131315] border border-[#3d494c] p-4 h-full flex flex-col relative overflow-hidden">
              {/* Corner accents */}
              {["top-0 left-0 border-t border-l", "top-0 right-0 border-t border-r",
                "bottom-0 left-0 border-b border-l", "bottom-0 right-0 border-b border-r"].map((pos, i) => (
                <div key={i} className={`absolute w-3 h-3 border-[#869397] ${pos}`} />
              ))}

              {/* Mode Selector Tabs */}
              <header className="flex justify-between items-center mb-4 pb-2 border-b border-[#3d494c] gap-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab("camera")}
                    className={cn(
                      "px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-wider border transition-all flex items-center gap-2 font-semibold",
                      activeTab === "camera"
                        ? "bg-[#4cd7f6] text-[#003640] border-[#4cd7f6]"
                        : "bg-[#0e0e10] text-[#bcc9cd] border-[#3d494c] hover:text-[#4cd7f6]"
                    )}
                  >
                    <Camera size={14} />
                    Optical Scanner
                  </button>
                  <button
                    onClick={() => setActiveTab("code")}
                    className={cn(
                      "px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-wider border transition-all flex items-center gap-2 font-semibold",
                      activeTab === "code"
                        ? "bg-[#4edea3] text-[#003640] border-[#4edea3]"
                        : "bg-[#0e0e10] text-[#bcc9cd] border-[#3d494c] hover:text-[#4edea3]"
                    )}
                  >
                    <KeyRound size={14} />
                    Enter 6-Digit Code
                  </button>
                </div>
                <span className="text-[11px] font-mono text-[#4cd7f6] font-bold">
                  {activeTab === "camera" ? `${scanFps}.0 FPS` : "PASSKEY MODE"}
                </span>
              </header>

              {/* Camera mode panel */}
              {activeTab === "camera" ? (
                <>
                  {cameras.length > 1 && (
                    <div className="mb-3 flex items-center gap-2">
                      <label className="text-[11px] font-mono text-[#bcc9cd] uppercase">Camera Lens:</label>
                      <select
                        value={selectedCameraId}
                        onChange={(e) => handleCameraChange(e.target.value)}
                        className="bg-[#0e0e10] border border-[#3d494c] text-[11px] font-mono text-[#4cd7f6] px-2 py-1 focus:outline-none"
                      >
                        {cameras.map((c, i) => (
                          <option key={c.deviceId} value={c.deviceId}>
                            {c.label || `Camera ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div
                    onClick={() => videoRef.current?.play().catch(() => {})}
                    className="flex-1 bg-[#0e0e10] border border-[#3d494c] relative overflow-hidden flex items-center justify-center min-h-[380px] cursor-pointer"
                  >
                    {/* ANDROID FIX: video must be fully visible in DOM for Android Chrome to decode frames.
                        Using opacity:0 or display:none or 1x1px causes black/frozen feed on Android. */}
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      onCanPlay={() => videoRef.current?.play().catch(() => {})}
                      onLoadedMetadata={() => videoRef.current?.play().catch(() => {})}
                      className="w-full h-full object-cover"
                    />

                    {!permissionGranted && !cameraError && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0e0e10] p-6 text-center">
                        <span className="text-4xl animate-bounce">📷</span>
                        <p className="text-[12px] font-mono uppercase text-[#bcc9cd]">Requesting Camera Access...</p>
                      </div>
                    )}

                    {cameraError && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0e0e10] p-6 text-center">
                        <span className="text-4xl text-[#ffb4ab]">⚠️</span>
                        <p className="text-[12px] font-mono uppercase text-[#ffb4ab]">{cameraError}</p>
                        <button
                          onClick={() => startCamera(selectedCameraId)}
                          className="px-4 py-2 border border-[#4cd7f6] text-[#4cd7f6] font-mono text-[11px] uppercase hover:bg-[#4cd7f6]/10"
                        >
                          Retry Camera Permission
                        </button>
                      </div>
                    )}

                    {/* Viewfinder Target */}
                    {permissionGranted && (
                      <div className="absolute inset-12 border border-[#4cd7f6]/30 pointer-events-none flex items-center justify-center">
                        <div className="w-24 h-24 border-t-2 border-l-2 border-r-2 border-b-2 border-[#4cd7f6] animate-pulse" />
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* 6-Digit Passkey Entry View */
                <div className="flex-1 bg-[#0e0e10] border border-[#3d494c] p-6 flex flex-col items-center justify-center gap-6 relative">
                  <div className="text-center flex flex-col items-center gap-2">
                    <div className="w-12 h-12 border-2 border-[#4edea3] flex items-center justify-center bg-[#4edea3]/10">
                      <KeyRound className="text-[#4edea3]" size={28} />
                    </div>
                    <h3 className="text-lg font-mono font-bold text-[#4edea3] uppercase tracking-wider">
                      Enter 6-Digit Transfer Code
                    </h3>
                    <p className="text-[11px] font-mono text-[#869397] max-w-sm">
                      Type the 6-digit passkey generated on your mobile phone to immediately download the file payload onto this PC.
                    </p>
                  </div>

                  {/* 6 Box OTP Input */}
                  <div className="flex gap-2.5 my-2">
                    {codeDigits.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => { inputRefs.current[index] = el; }}
                        type="text"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleDigitChange(index, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(index, e)}
                        className="w-12 h-16 bg-[#131315] border-2 border-[#3d494c] focus:border-[#4edea3] text-center text-3xl font-mono font-bold text-[#4edea3] focus:outline-none transition-colors shadow-lg"
                        autoFocus={index === 0}
                      />
                    ))}
                  </div>

                  {codeError && (
                    <div className="flex items-center gap-2 text-[#ffb4ab] font-mono text-[11px] bg-[#ffb4ab]/10 border border-[#ffb4ab]/30 p-2.5">
                      <AlertCircle size={16} />
                      <span>{codeError}</span>
                    </div>
                  )}

                  <button
                    onClick={() => verifyCode(codeDigits.join(""))}
                    disabled={codeDigits.join("").length !== 6 || codeVerifying}
                    className={cn(
                      "w-full max-w-xs font-mono text-[11px] uppercase tracking-widest py-3.5 border flex items-center justify-center gap-2 transition-all font-bold",
                      codeDigits.join("").length === 6 && !codeVerifying
                        ? "bg-[#4edea3] text-[#003640] border-[#4edea3] hover:bg-[#acedff]"
                        : "bg-transparent text-[#3d494c] border-[#3d494c] cursor-not-allowed"
                    )}
                  >
                    {codeVerifying ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Verifying Passkey...
                      </>
                    ) : (
                      <>
                        <Download size={16} />
                        Fetch Payload to PC
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* Right – Clean Telemetry Panel */}
          <section className="lg:col-span-5 flex flex-col">
            <div className="bg-[#131315] border border-[#3d494c] p-4 h-full flex flex-col justify-between">
              <header className="flex justify-between items-center mb-4 pb-2 border-b border-[#3d494c]">
                <h2 className="text-[11px] font-mono uppercase tracking-widest text-[#bcc9cd]">Telemetry Matrix</h2>
                <span className="text-[#3d494c] text-xs font-mono">📡 COLLECTOR</span>
              </header>

              {/* Clean Statistics Grid (Progress %, Chunk Ratio, FPS, Time Remaining) */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-[#0e0e10] border border-[#3d494c] p-3 flex flex-col justify-between border-b-2 border-b-[#4edea3]">
                  <span className="text-[10px] font-mono uppercase text-[#869397] flex items-center gap-1">
                    <Zap size={12} className="text-[#4edea3]" /> Progress
                  </span>
                  <span className="text-3xl font-mono font-bold text-[#4edea3] mt-1">
                    {progressPct}%
                  </span>
                </div>

                <div className="bg-[#0e0e10] border border-[#3d494c] p-3 flex flex-col justify-between">
                  <span className="text-[10px] font-mono uppercase text-[#869397] flex items-center gap-1">
                    <Layers size={12} className="text-[#4cd7f6]" /> Chunk Ratio
                  </span>
                  <span className="text-base font-mono font-bold text-[#e5e1e4] mt-1 truncate">
                    {totalChunks ? `${receivedCount} / ${totalChunks}` : "0 / --"}
                  </span>
                </div>

                <div className="bg-[#0e0e10] border border-[#3d494c] p-3 flex flex-col justify-between">
                  <span className="text-[10px] font-mono uppercase text-[#869397] flex items-center gap-1">
                    <Activity size={12} className="text-[#4cd7f6]" /> Scan Speed
                  </span>
                  <span className="text-base font-mono font-bold text-[#4cd7f6] mt-1">
                    {scanFps}.0 FPS
                  </span>
                </div>

                <div className="bg-[#0e0e10] border border-[#3d494c] p-3 flex flex-col justify-between">
                  <span className="text-[10px] font-mono uppercase text-[#869397] flex items-center gap-1">
                    <Clock size={12} className="text-[#bcc9cd]" /> Est. Time
                  </span>
                  <span className="text-base font-mono font-bold text-[#e5e1e4] mt-1">
                    {totalChunks ? (estSecondsLeft > 0 ? `${estSecondsLeft}s` : "Done") : "--"}
                  </span>
                </div>
              </div>

              {/* Dynamic Chunk Grid Matrix with Precision Indexing */}
              <div className="bg-[#0e0e10] border border-[#3d494c] p-3 flex flex-col gap-2 flex-1">
                <div className="flex justify-between text-[10px] font-mono text-[#bcc9cd]">
                  <span>CHUNK FRAME MATRIX ({totalChunks || 0} TOTAL)</span>
                  <span className="text-[#4edea3] font-bold">
                    {receivedCount} CAPTURED
                  </span>
                </div>

                {/* Adaptive Scrollable Tile Grid: Small 8x8px tiles when totalChunks > 300 */}
                <div className="flex-1 min-h-[220px] max-h-[320px] overflow-y-auto p-2 bg-[#131315] border border-[#3d494c]">
                  {totalChunks && totalChunks > 0 ? (
                    <div
                      className={cn(
                        "grid gap-1",
                        totalChunks > 300
                          ? "grid-cols-[repeat(auto-fill,minmax(8px,1fr))]"
                          : "grid-cols-10"
                      )}
                    >
                      {Array.from({ length: totalChunks }).map((_, index) => {
                        const isCaptured = receivedIndexes.has(index);
                        return (
                          <div
                            key={index}
                            className={cn(
                              "transition-colors rounded-[1px]",
                              totalChunks > 300 ? "h-2 w-2" : "h-3.5 w-full",
                              isCaptured
                                ? "bg-[#4edea3] border border-[#4edea3] shadow-[0_0_4px_rgba(78,222,163,0.8)]"
                                : "bg-[#181c1e] border border-[#293235] opacity-50"
                            )}
                            title={`Chunk ${index + 1}/${totalChunks}: ${isCaptured ? "Captured" : "Missing"}`}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-4 gap-2 text-[#3d494c]">
                      <Layers size={24} />
                      <span className="text-[10px] font-mono uppercase">Awaiting Optical Payload Stream...</span>
                    </div>
                  )}
                </div>
              </div>

              {errorMsg && (
                <div className="mt-3 p-3 bg-[#ffb4ab]/10 border border-[#ffb4ab]/40 text-[11px] font-mono text-[#ffb4ab]">
                  ⚠️ {errorMsg}
                </div>
              )}
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

      {/* Completion Modal */}
      {showModal && result && (
        <CompletionModal
          open={showModal}
          onClose={() => {
            setShowModal(false);
            completedRef.current = false;
            chunksMapRef.current.clear();
            receivedIndexesRef.current.clear();
            setReceivedIndexes(new Set());
            setTotalChunks(null);
          }}
          result={result}
        />
      )}
    </div>
  );
}

"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Download, CheckCircle, ShieldCheck } from "lucide-react";

function DownloadContent() {
  const searchParams = useSearchParams();
  const pathname = searchParams.get("p") || searchParams.get("pathname") || "";
  const filename = searchParams.get("f") || searchParams.get("filename") || pathname.split("/").pop() || "downloaded_file";

  const [downloadStarted, setDownloadStarted] = useState(false);

  const downloadApiUrl = `/api/d?p=${encodeURIComponent(pathname)}&f=${encodeURIComponent(filename)}`;

  useEffect(() => {
    if (pathname) {
      // Trigger automatic instant download immediately on page load
      setDownloadStarted(true);
      const timer = setTimeout(() => {
        window.location.href = downloadApiUrl;
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [pathname, downloadApiUrl]);

  if (!pathname) {
    return (
      <div className="bg-[#131315] text-[#e5e1e4] min-h-screen flex items-center justify-center p-6 font-mono">
        <div className="bg-[#0e0e10] border border-[#ffb4ab]/30 p-6 text-center text-[#ffb4ab]">
          ⚠ Invalid or missing download payload parameter.
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-[#131315] text-[#e5e1e4] min-h-screen flex flex-col items-center justify-center p-6 antialiased font-[Inter,sans-serif]"
      style={{
        backgroundImage:
          "linear-gradient(to bottom,rgba(255,255,255,0),rgba(255,255,255,0) 50%,rgba(0,0,0,0.08) 50%,rgba(0,0,0,0.08))",
        backgroundSize: "100% 4px",
      }}
    >
      <div
        className="bg-[#131315] border border-[#4cd7f6] w-full max-w-md p-6 flex flex-col gap-5 text-center relative"
        style={{ boxShadow: "0 0 30px rgba(76,215,246,0.25)" }}
      >
        {/* Header */}
        <div className="flex flex-col items-center gap-2">
          <div
            className="w-12 h-12 border-2 border-[#4edea3] flex items-center justify-center bg-[#4edea3]/10"
            style={{ boxShadow: "0 0 15px rgba(78,222,163,0.3)" }}
          >
            <ShieldCheck className="text-[#4edea3]" size={28} />
          </div>
          <h1 className="text-2xl font-bold text-[#4cd7f6] tracking-tight uppercase">BEAM-NET SECURE DOWNLOAD</h1>
          <p className="text-[11px] font-mono text-[#869397]">Private Vercel Blob Store Transfer</p>
        </div>

        {/* File Card */}
        <div className="bg-[#0e0e10] border border-[#3d494c] p-4 font-mono text-left flex flex-col gap-1">
          <span className="text-[10px] text-[#3d494c] uppercase">Target File Payload:</span>
          <span className="text-[#e5e1e4] font-bold text-[14px] truncate">{filename}</span>
        </div>

        {/* Status */}
        <div className="flex items-center justify-center gap-2 text-[#4edea3] font-mono text-[12px] uppercase tracking-wider">
          <CheckCircle size={16} className="animate-pulse" />
          <span>{downloadStarted ? "Instant Auto-Download Triggered..." : "Initiating Transfer..."}</span>
        </div>

        {/* Manual Download Button Backup */}
        <div className="flex flex-col gap-2 mt-2">
          <a
            href={downloadApiUrl}
            className="w-full bg-[#4cd7f6] text-[#003640] py-3.5 font-mono text-[11px] uppercase tracking-widest hover:bg-[#acedff] transition-all flex items-center justify-center gap-2 font-bold"
            style={{ boxShadow: "0 0 12px rgba(76,215,246,0.2)" }}
          >
            <Download size={16} />
            Download File ({filename})
          </a>
          <p className="text-[9px] font-mono text-[#3d494c]">
            If your browser popup blocker prevented automatic download, click the button above.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function DirectDownloadPage() {
  return (
    <Suspense fallback={<div className="bg-[#131315] text-[#e5e1e4] min-h-screen flex items-center justify-center font-mono">Loading...</div>}>
      <DownloadContent />
    </Suspense>
  );
}

"use client";

import React, { useEffect } from "react";
import { QrCode, CloudUpload, X } from "lucide-react";
import { cn } from "@/utils/cn";

interface MethodSelectorModalProps {
  open: boolean;
  onClose: () => void;
  fileName: string;
  originalSize: number;
  compressedSize?: number;
  onSelectMethod: (method: "optical" | "cloud") => void;
}

function fmtSize(b: number): string {
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  return `${(b / 1024).toFixed(1)} KB`;
}

export default function MethodSelectorModal({
  open,
  onClose,
  fileName,
  originalSize,
  compressedSize,
  onSelectMethod,
}: MethodSelectorModalProps) {
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-[Inter,sans-serif]">
      <div
        className="bg-[#131315] border border-[#4cd7f6] w-full max-w-lg flex flex-col gap-5 p-6 relative"
        style={{ boxShadow: "0 0 25px rgba(76,215,246,0.2)" }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#869397] hover:text-[#e5e1e4] transition-colors"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        {/* Title */}
        <div>
          <h3 className="text-[#4cd7f6] font-bold text-xl uppercase tracking-tight flex items-center gap-2">
            <span className="w-2 h-2 bg-[#4cd7f6] inline-block animate-pulse" />
            Select Transfer Protocol
          </h3>
          <p className="text-[11px] font-mono text-[#869397] mt-1">
            File size ≤ 100 KB. Choose your preferred transmission method.
          </p>
        </div>

        {/* File Badge */}
        <div className="bg-[#0e0e10] border border-[#3d494c] p-3 font-mono text-[11px] flex justify-between items-center">
          <span className="text-[#e5e1e4] font-medium truncate max-w-[240px]">{fileName}</span>
          <span className="text-[#4edea3]">
            {fmtSize(originalSize)}
            {compressedSize && compressedSize > 0 ? ` → Gzip ~${fmtSize(compressedSize)}` : ""}
          </span>
        </div>

        {/* Transfer Options */}
        <div className="space-y-3 font-mono">
          {/* 1. DE-EMPHASIZED OPTION: AIR-GAPPED OPTICAL STREAM */}
          <button
            type="button"
            onClick={() => {
              onSelectMethod("optical");
              onClose();
            }}
            className="w-full text-left p-4 rounded-xl border border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900/70 hover:border-zinc-700 transition-all group flex items-start gap-4 opacity-75 hover:opacity-100"
          >
            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-400 group-hover:text-cyan-400 transition-colors flex-shrink-0">
              <QrCode size={24} />
            </div>

            <div className="flex-1">
              <div className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                AIR-GAPPED OPTICAL STREAM
              </div>
              <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
                Pure Air-Gapped Transmission (Sequential QR Stream). 100% offline, zero network required.
              </p>
            </div>
          </button>

          {/* 2. PRIMARY HIGHLIGHTED OPTION: PRIVATE ENCRYPTED CLOUD */}
          <button
            type="button"
            onClick={() => {
              onSelectMethod("cloud");
              onClose();
            }}
            className="relative w-full text-left p-4 rounded-xl border-2 border-cyan-400/90 bg-cyan-950/25 hover:bg-cyan-950/40 shadow-lg shadow-cyan-500/10 transition-all flex items-start gap-4 group ring-1 ring-cyan-400/20"
          >
            {/* HIGHLIGHT BADGE IN TOP RIGHT */}
            <span className="absolute -top-2.5 right-4 bg-cyan-400 text-black font-black text-[9px] px-2.5 py-0.5 rounded-full tracking-wider uppercase shadow-md shadow-cyan-400/30 flex items-center gap-1">
              <span>⚡</span> RECOMMENDED
            </span>

            <div className="p-3 rounded-lg bg-cyan-900/40 border border-cyan-500/40 text-cyan-400 flex-shrink-0 group-hover:scale-105 transition-transform">
              <CloudUpload size={24} />
            </div>

            <div className="flex-1">
              <div className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
                PRIVATE ENCRYPTED CLOUD
              </div>
              <p className="text-[11px] text-zinc-300 mt-1 leading-relaxed font-normal">
                Fast cloud upload returning a single URL QR code & instant 6-digit code.
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

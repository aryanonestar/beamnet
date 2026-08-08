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
        <div className="grid grid-cols-1 gap-3">
          {/* Option 1: Optical QR */}
          <button
            onClick={() => {
              onSelectMethod("optical");
              onClose();
            }}
            className={cn(
              "p-4 border bg-[#0e0e10] text-left flex items-start gap-4 transition-all group hover:border-[#4edea3]",
              "border-[#3d494c]"
            )}
          >
            <div className="p-3 border border-[#4edea3]/30 bg-[#4edea3]/10 text-[#4edea3] group-hover:scale-105 transition-transform shrink-0">
              <QrCode size={24} />
            </div>
            <div>
              <div className="text-[13px] font-mono font-bold text-[#e5e1e4] uppercase tracking-wider group-hover:text-[#4edea3] transition-colors">
                Air-Gapped Optical Stream
              </div>
              <p className="text-[11px] font-mono text-[#869397] mt-1">
                Pure Air-Gapped Transmission (Sequential QR Stream). 100% offline, zero network required.
              </p>
            </div>
          </button>

          {/* Option 2: Cloud Upload */}
          <button
            onClick={() => {
              onSelectMethod("cloud");
              onClose();
            }}
            className={cn(
              "p-4 border bg-[#0e0e10] text-left flex items-start gap-4 transition-all group hover:border-[#4cd7f6]",
              "border-[#3d494c]"
            )}
          >
            <div className="p-3 border border-[#4cd7f6]/30 bg-[#4cd7f6]/10 text-[#4cd7f6] group-hover:scale-105 transition-transform shrink-0">
              <CloudUpload size={24} />
            </div>
            <div>
              <div className="text-[13px] font-mono font-bold text-[#e5e1e4] uppercase tracking-wider group-hover:text-[#4cd7f6] transition-colors">
                Private Encrypted Cloud
              </div>
              <p className="text-[11px] font-mono text-[#869397] mt-1">
                Fast cloud upload returning a single URL QR code.
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

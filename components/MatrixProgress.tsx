"use client";

import React from "react";
import { cn } from "@/utils/cn";

interface MatrixProgressProps {
  progress: number; // 0 to 100
  statusText?: string;
  fileName?: string;
}

export default function MatrixProgress({
  progress,
  statusText = "PROCESSING PAYLOAD...",
  fileName,
}: MatrixProgressProps) {
  const clampedProgress = Math.min(100, Math.max(0, Math.round(progress)));

  return (
    <div className="w-full max-w-[420px] bg-[#0e0e10] border border-[#3d494c] p-6 flex flex-col items-center gap-5 relative overflow-hidden font-mono shadow-2xl">
      {/* Corner Cyber Accents */}
      <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-[#4cd7f6]" />
      <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-[#4cd7f6]" />
      <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-[#4cd7f6]" />
      <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2 border-[#4cd7f6]" />

      {/* Header Readout */}
      <div className="w-full flex justify-between items-center pb-2 border-b border-[#3d494c]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-[#4edea3] animate-pulse" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#4cd7f6]">
            PAYLOAD MATRIX
          </span>
        </div>
        <span className="text-[13px] font-bold text-[#4edea3]">
          {clampedProgress}%
        </span>
      </div>

      {/* File Name Tag */}
      {fileName && (
        <div className="w-full bg-[#131315] border border-[#3d494c] px-3 py-1.5 text-[10px] text-[#bcc9cd] truncate text-center">
          📄 {fileName}
        </div>
      )}

      {/* 10 x 10 Grid Matrix (100 Green Blocks) */}
      <div className="grid grid-cols-10 gap-1.5 p-3 bg-[#131315] border border-[#3d494c] w-full max-w-[340px] aspect-square">
        {Array.from({ length: 100 }).map((_, i) => {
          const isFilled = i < clampedProgress;
          const isCurrent = i === clampedProgress && clampedProgress < 100;

          return (
            <div
              key={i}
              className={cn(
                "w-full h-full border transition-all duration-150 rounded-[1px]",
                isFilled
                  ? "bg-[#4edea3] border-[#4edea3] shadow-[0_0_8px_rgba(78,222,163,0.85)] scale-[0.96]"
                  : isCurrent
                  ? "bg-[#4cd7f6] border-[#4cd7f6] animate-pulse shadow-[0_0_12px_rgba(76,215,246,1)] scale-[1.05]"
                  : "bg-[#181c1e] border-[#293235] opacity-40"
              )}
              title={`Block ${i + 1}/100: ${isFilled ? "Complete" : "Pending"}`}
            />
          );
        })}
      </div>

      {/* Telemetry Counter */}
      <div className="w-full flex justify-between text-[10px] text-[#869397] pt-1">
        <span>BLOCKS: {clampedProgress} / 100</span>
        <span className="text-[#4edea3]">
          {clampedProgress === 100 ? "✓ COMPLETE" : "TRANSMITTING..."}
        </span>
      </div>

      {/* Footer Status Text */}
      <div className="w-full bg-[#4cd7f6]/10 border border-[#4cd7f6]/40 p-2 text-center text-[10px] text-[#4cd7f6] tracking-wider uppercase animate-pulse">
        {statusText}
      </div>
    </div>
  );
}

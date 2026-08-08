"use client";

import React, { useEffect, useState } from "react";
import {
  isTextPreviewable,
  isImagePreviewable,
  isVideoPreviewable,
  isAudioPreviewable,
  inferMimeType,
  type ReassemblyResult,
} from "@/lib/chunker";
import { cn } from "@/utils/cn";

interface CompletionModalProps {
  open: boolean;
  onClose: () => void;
  blobUrl?: string;
  fileName?: string;
  mimeType?: string;
  totalChunks?: number;
  textContent?: string;
  result?: ReassemblyResult;
  batchFiles?: { url: string; name: string }[];
}

/** Maps file extension to a display language label for code preview */
function getLanguageLabel(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    js: "JavaScript", ts: "TypeScript", jsx: "JSX", tsx: "TSX",
    py: "Python", java: "Java", cpp: "C++", c: "C", cs: "C#",
    go: "Go", rs: "Rust", rb: "Ruby", php: "PHP", swift: "Swift",
    kt: "Kotlin", html: "HTML", css: "CSS", json: "JSON",
    xml: "XML", yaml: "YAML", yml: "YAML", md: "Markdown",
    txt: "Plain Text", csv: "CSV", pdf: "PDF", zip: "ZIP Archive",
  };
  return map[ext] ?? ext.toUpperCase() ?? "FILE";
}

export default function CompletionModal({
  open,
  onClose,
  blobUrl,
  fileName,
  mimeType,
  totalChunks,
  textContent,
  result,
  batchFiles,
}: CompletionModalProps) {
  const [activeTab, setActiveTab] = useState<"code" | "meta">("code");
  const [copied, setCopied] = useState(false);

  const downloadAllFiles = (files: { url: string; name: string }[]) => {
    files.forEach((file, index) => {
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = file.url;
        a.download = file.name;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, index * 300);
    });
  };

  const activeBlobUrl = result?.blobUrl || blobUrl || "";
  const activeFileName = result?.fileName || fileName || "downloaded_file";
  const activeMimeType = result?.mimeType || mimeType || inferMimeType(activeFileName);
  const activeTotalChunks = totalChunks || 1;
  const activeTextContent = result?.textContent || textContent;

  const isText = isTextPreviewable(activeMimeType);
  const isImg = isImagePreviewable(activeMimeType);
  const isVid = isVideoPreviewable(activeMimeType);
  const isAud = isAudioPreviewable(activeMimeType);
  const isPdf = activeMimeType === "application/pdf";

  useEffect(() => {
    if (open && isText && activeTextContent) {
      setActiveTab("code");
    } else {
      setActiveTab("meta");
    }
  }, [open, isText, activeTextContent]);

  if (!open) return null;

  const copyCode = () => {
    if (activeTextContent) {
      navigator.clipboard.writeText(activeTextContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const lines = activeTextContent ? activeTextContent.split("\n") : [];
  const langLabel = getLanguageLabel(activeFileName);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md font-mono">
      <div
        className="bg-[#131315] border border-[#4edea3] w-full max-w-2xl max-h-[85vh] flex flex-col relative overflow-hidden text-[#e5e1e4]"
        style={{ boxShadow: "0 0 40px rgba(78,222,163,0.3)" }}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#3d494c] bg-[#0e0e10]">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-[#4edea3] animate-pulse rounded-none" />
            <h2 className="text-[13px] font-bold text-[#4edea3] uppercase tracking-widest">
              Payload Intact & Verified
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#869397] hover:text-white transition-colors text-lg"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-5">
          {/* File Card */}
          <div className="bg-[#0e0e10] border border-[#3d494c] p-4 flex flex-col gap-2">
            <div className="flex justify-between items-center text-[10px] text-[#869397]">
              <span>FILE NAME</span>
              <span className="text-[#4cd7f6]">{langLabel}</span>
            </div>
            <p className="text-[15px] font-bold text-[#e5e1e4] truncate">{activeFileName}</p>
            <div className="flex justify-between items-center text-[11px] text-[#bcc9cd] pt-2 border-t border-[#3d494c]/40">
              <span>Type: {activeMimeType}</span>
              <span>Frames: {activeTotalChunks}</span>
            </div>
          </div>

          {/* Navigation Tabs */}
          {isText && activeTextContent && (
            <div className="flex border-b border-[#3d494c]">
              <button
                onClick={() => setActiveTab("code")}
                className={cn(
                  "px-4 py-2 text-[11px] uppercase tracking-wider border-b-2 transition-all",
                  activeTab === "code"
                    ? "border-[#4edea3] text-[#4edea3] font-bold bg-[#4edea3]/5"
                    : "border-transparent text-[#869397] hover:text-white"
                )}
              >
                Code / Text Preview
              </button>
              <button
                onClick={() => setActiveTab("meta")}
                className={cn(
                  "px-4 py-2 text-[11px] uppercase tracking-wider border-b-2 transition-all",
                  activeTab === "meta"
                    ? "border-[#4edea3] text-[#4edea3] font-bold bg-[#4edea3]/5"
                    : "border-transparent text-[#869397] hover:text-white"
                )}
              >
                Media / Info
              </button>
            </div>
          )}

          {/* Code Syntax Preview Tab */}
          {activeTab === "code" && isText && activeTextContent ? (
            <div className="bg-[#08080a] border border-[#3d494c] relative overflow-hidden flex flex-col">
              <div className="flex justify-between items-center px-4 py-2 bg-[#0e0e10] border-b border-[#3d494c] text-[10px] text-[#869397]">
                <span>{lines.length} LINES ({langLabel})</span>
                <button
                  onClick={copyCode}
                  className="text-[#4cd7f6] hover:underline uppercase"
                >
                  {copied ? "✓ COPIED" : "COPY CONTENT"}
                </button>
              </div>
              <pre className="p-4 text-[12px] text-[#4edea3] max-h-64 overflow-auto font-mono whitespace-pre-wrap break-all leading-relaxed">
                {lines.map((line, i) => (
                  <div key={i} className="flex gap-4">
                    <span className="text-[#3d494c] select-none w-8 text-right shrink-0">{i + 1}</span>
                    <span className="flex-1">{line}</span>
                  </div>
                ))}
              </pre>
            </div>
          ) : null}

          {/* Media Previews (Images, Video, Audio, PDF) */}
          {(activeTab === "meta" || !isText) && (
            <div className="flex flex-col gap-4">
              {isImg && activeBlobUrl && (
                <div className="border border-[#3d494c] bg-black p-2 flex justify-center max-h-64 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={activeBlobUrl} alt={activeFileName} className="max-h-60 object-contain" />
                </div>
              )}
              {isVid && activeBlobUrl && (
                <div className="border border-[#3d494c] bg-black p-2">
                  <video src={activeBlobUrl} controls className="max-h-64 w-full" />
                </div>
              )}
              {isAud && activeBlobUrl && (
                <div className="border border-[#3d494c] bg-black p-4">
                  <audio src={activeBlobUrl} controls className="w-full" />
                </div>
              )}
              {isPdf && activeBlobUrl && (
                <div className="border border-[#3d494c] bg-black p-2 h-64">
                  <iframe src={activeBlobUrl} className="w-full h-full border-none" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-[#0e0e10] border-t border-[#3d494c] flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 border border-[#3d494c] text-[#bcc9cd] text-[11px] uppercase hover:bg-[#3d494c]/20 transition-colors"
          >
            Close
          </button>
          {batchFiles && batchFiles.length > 0 ? (
            <button
              onClick={() => downloadAllFiles(batchFiles)}
              className="px-6 py-2.5 bg-[#4cd7f6] text-[#003640] font-bold text-[11px] uppercase tracking-wider hover:bg-[#acedff] transition-all flex items-center gap-2 font-mono"
              style={{ boxShadow: "0 0 15px rgba(76,215,246,0.4)" }}
            >
              ⚡ DOWNLOAD ALL ({batchFiles.length} FILES)
            </button>
          ) : activeBlobUrl ? (
            <a
              href={activeBlobUrl}
              download={activeFileName}
              className="px-6 py-2.5 bg-[#4edea3] text-[#003640] font-bold text-[11px] uppercase tracking-wider hover:bg-[#acedff] transition-all flex items-center gap-2 font-mono"
              style={{ boxShadow: "0 0 15px rgba(78,222,163,0.4)" }}
            >
              ⬇ Download File ({activeFileName})
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

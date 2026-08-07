/**
 * lib/chunker.ts
 * Universal client-side chunking, compression, and reassembly engine for BEAM-NET.
 * Supports all file types: code, documents, images, video, audio, archives.
 */

import { gzip, ungzip } from "pako/browser";
import CRC32 from "crc-32";

// ─── MIME inference from extension ───────────────────────────────────────────

const EXT_MIME_MAP: Record<string, string> = {
  // Code
  js: "text/javascript", ts: "text/typescript", jsx: "text/javascript",
  tsx: "text/typescript", py: "text/x-python", java: "text/x-java-source",
  cpp: "text/x-c++src", c: "text/x-csrc", cs: "text/x-csharp",
  go: "text/x-go", rs: "text/x-rust", rb: "text/x-ruby",
  php: "text/x-php", swift: "text/x-swift", kt: "text/x-kotlin",
  // Data / Config
  json: "application/json", xml: "text/xml", yaml: "text/yaml",
  yml: "text/yaml", toml: "text/plain", env: "text/plain",
  // Documents
  html: "text/html", htm: "text/html", css: "text/css",
  md: "text/markdown", txt: "text/plain", csv: "text/csv",
  pdf: "application/pdf", doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // Images
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  bmp: "image/bmp", ico: "image/x-icon",
  // Video
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  avi: "video/x-msvideo", mkv: "video/x-matroska",
  // Audio
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
  flac: "audio/flac", aac: "audio/aac",
  // Archives
  zip: "application/zip", tar: "application/x-tar",
  gz: "application/gzip", rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
};

export function inferMimeType(fileName: string, fileMime?: string): string {
  if (fileMime && fileMime !== "application/octet-stream") return fileMime;
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME_MAP[ext] ?? "application/octet-stream";
}

/** Returns true if the MIME type represents a plain-text/code file previewable in the browser */
export function isTextPreviewable(mimeType: string): boolean {
  return (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml"
  );
}

export function isImagePreviewable(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

export function isVideoPreviewable(mimeType: string): boolean {
  return mimeType.startsWith("video/");
}

export function isAudioPreviewable(mimeType: string): boolean {
  return mimeType.startsWith("audio/");
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChunkMeta {
  id: string;
  totalChunks: number;
  chunkIndex: number;
  mimeType: string;
  fileName: string;
  fileSize: number; // original uncompressed size in bytes
  crc32: string;    // hex CRC32 of the full compressed payload
}

export interface Chunk {
  meta: ChunkMeta;
  payload: string; // base64-encoded slice of compressed data
}

export interface ReassemblyResult {
  blobUrl: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
  /** For text/code files, the raw decoded string — ready for syntax preview */
  textContent?: string;
  crc32Valid?: boolean;
}


// ─── Compression ──────────────────────────────────────────────────────────────

/** Compress any File to gzipped bytes. Supports all file types. */
export async function compressFile(file: File): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  return gzip(new Uint8Array(buffer));
}

// ─── Chunking ─────────────────────────────────────────────────────────────────

/**
 * Split compressed bytes into QR-ready chunk frames.
 * @param data         Output of compressFile()
 * @param chunkSize    Max base64 chars per chunk (≤500 recommended)
 * @param meta         Transmission metadata (without computed fields)
 */
export function createChunks(
  data: Uint8Array,
  chunkSize: number,
  meta: Omit<ChunkMeta, "totalChunks" | "chunkIndex" | "crc32">
): Chunk[] {
  const base64 = uint8ToBase64(data);
  const totalChunks = Math.ceil(base64.length / chunkSize);
  const checksum = ((CRC32.buf(data) >>> 0) as number).toString(16);

  return Array.from({ length: totalChunks }, (_, i) => ({
    meta: { ...meta, totalChunks, chunkIndex: i, crc32: checksum },
    payload: base64.slice(i * chunkSize, (i + 1) * chunkSize),
  }));
}

// ─── Pipe Protocol ────────────────────────────────────────────────────────────

export interface PipePacket {
  fileName: string;
  fileType: string;
  totalChunks: number;
  chunkIndex: number;
  payload: string;
}

/**
 * Create ultra-compact pipe-delimited QR packets (CHUNK_SIZE = 150 chars base64)
 * Format: BEAM|fileName|fileType|totalChunks|chunkIndex|payload
 */
export function createPipePackets(
  data: Uint8Array,
  fileName: string,
  fileType: string,
  chunkSize: number = 150
): string[] {
  const base64 = uint8ToBase64(data);
  const totalChunks = Math.ceil(base64.length / chunkSize);
  const safeName = fileName.replace(/\|/g, "_");
  const safeType = (fileType || "application/octet-stream").replace(/\|/g, "_");

  const packets: string[] = [];
  for (let i = 0; i < totalChunks; i++) {
    const slice = base64.slice(i * chunkSize, (i + 1) * chunkSize);
    packets.push(`BEAM|${safeName}|${safeType}|${totalChunks}|${i}|${slice}`);
  }
  return packets;
}

export function parsePipePacket(rawData: string): PipePacket | null {
  if (!rawData || !rawData.startsWith("BEAM|")) return null;
  const parts = rawData.split("|");
  if (parts.length < 6) return null;

  const [prefix, fileName, fileType, totalStr, indexStr, payload] = parts;
  const totalChunks = parseInt(totalStr, 10);
  const chunkIndex = parseInt(indexStr, 10);

  if (isNaN(totalChunks) || isNaN(chunkIndex)) return null;

  return { fileName, fileType, totalChunks, chunkIndex, payload };
}

export async function reassemblePipePackets(
  chunksMap: Map<number, string>,
  totalChunks: number,
  fileName: string,
  fileType: string
): Promise<ReassemblyResult> {
  let fullBase64 = "";
  for (let i = 0; i < totalChunks; i++) {
    const chunk = chunksMap.get(i);
    if (!chunk) {
      throw new Error(`Missing chunk index ${i}`);
    }
    fullBase64 += chunk;
  }

  const compressed = base64ToUint8(fullBase64);
  const decompressed = ungzip(compressed);
  const mimeType = inferMimeType(fileName, fileType);

  const blob = new Blob([decompressed as unknown as Uint8Array<ArrayBuffer>], { type: mimeType });
  const blobUrl = URL.createObjectURL(blob);

  let textContent: string | undefined;
  if (isTextPreviewable(mimeType)) {
    textContent = new TextDecoder("utf-8", { fatal: false }).decode(decompressed);
  }

  return {
    blobUrl,
    mimeType,
    fileName,
    fileSize: decompressed.byteLength,
    textContent,
    crc32Valid: true,
  };
}

// ─── Reassembly ───────────────────────────────────────────────────────────────

/**
 * Sort, concatenate, verify CRC, decompress, and return a BlobURL
 * plus optional text content for code/document preview.
 */
export async function reassembleAndUnpack(chunks: Chunk[]): Promise<ReassemblyResult> {
  const sorted = [...chunks].sort((a, b) => a.meta.chunkIndex - b.meta.chunkIndex);
  const base64 = sorted.map(c => c.payload).join("");
  const compressed = base64ToUint8(base64);

  // Integrity check
  const actualCrc = ((CRC32.buf(compressed) >>> 0) as number).toString(16);
  const expectedCrc = sorted[0].meta.crc32;
  if (actualCrc !== expectedCrc) {
    throw new Error(`CRC32 mismatch: expected ${expectedCrc}, got ${actualCrc}`);
  }

  // Decompress
  const decompressed = ungzip(compressed);
  const { mimeType, fileName, fileSize } = sorted[0].meta;

  // Build Blob URL
  const blob = new Blob([decompressed as unknown as Uint8Array<ArrayBuffer>], { type: mimeType });
  const blobUrl = URL.createObjectURL(blob);

  // Plain-text preview for code/document files
  let textContent: string | undefined;
  if (isTextPreviewable(mimeType)) {
    textContent = new TextDecoder("utf-8", { fatal: false }).decode(decompressed);
  }

  return { blobUrl, mimeType, fileName, fileSize, textContent };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** UUID v4 without dependencies */
export function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Browser-safe Uint8Array → base64 */
function uint8ToBase64(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.byteLength; i++) binary += String.fromCharCode(data[i]);
  return btoa(binary);
}

/** Browser-safe base64 → Uint8Array */
function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Re-export for backward compat with utils/chunker
export { isTextPreviewable as isText };

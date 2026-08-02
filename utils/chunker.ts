// utils/chunker.ts
// Browser-compatible chunking, compression, and reassembly utilities.

import { gzip, ungzip } from "pako/browser";
import CRC32 from "crc-32";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ChunkMeta {
  /** Unique transmission ID so receiver can detect a new transfer */
  id: string;
  totalChunks: number;
  chunkIndex: number; // zero-based
  mimeType: string;
  fileName: string;
  /** CRC32 hex of the full compressed payload (for integrity check) */
  crc32: string;
}

export interface Chunk {
  meta: ChunkMeta;
  /** Base64-encoded slice of the compressed payload */
  payload: string;
}

// ─── Compression ────────────────────────────────────────────────────────────

/** Compress a File to a gzipped Uint8Array using pako. */
export async function compressFile(file: File): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  return gzip(new Uint8Array(arrayBuffer));
}

/** Decompress a gzipped Uint8Array back to the original bytes. */
export async function decompress(data: Uint8Array): Promise<Uint8Array> {
  return ungzip(data);
}

// ─── Chunking ────────────────────────────────────────────────────────────────

/**
 * Split a compressed Uint8Array into QR-ready chunks.
 *
 * @param data       Compressed bytes (output of compressFile)
 * @param chunkSize  Max base64 characters per chunk (keep ≤ 500 for reliability)
 * @param metaInfo   Transmission metadata without computed fields
 */
export function createChunks(
  data: Uint8Array,
  chunkSize: number,
  metaInfo: Omit<ChunkMeta, "totalChunks" | "chunkIndex" | "crc32">
): Chunk[] {
  // Convert to base64 once, then slice
  const base64 = uint8ToBase64(data);
  const totalChunks = Math.ceil(base64.length / chunkSize);
  const checksum = ((CRC32.buf(data) >>> 0) as number).toString(16);

  return Array.from({ length: totalChunks }, (_, i) => ({
    meta: {
      ...metaInfo,
      totalChunks,
      chunkIndex: i,
      crc32: checksum,
    },
    payload: base64.slice(i * chunkSize, (i + 1) * chunkSize),
  }));
}

// ─── Reassembly ──────────────────────────────────────────────────────────────

/**
 * Sort and concatenate chunks to rebuild the compressed payload.
 * Caller must verify CRC before decompressing.
 */
export function reassemble(chunks: Chunk[]): Uint8Array {
  const sorted = [...chunks].sort((a, b) => a.meta.chunkIndex - b.meta.chunkIndex);
  const base64 = sorted.map((c) => c.payload).join("");
  return base64ToUint8(base64);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** UUID v4 without external deps */
export function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Browser-safe Uint8Array → base64 (works without Buffer) */
function uint8ToBase64(data: Uint8Array): string {
  let binary = "";
  const len = data.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(data[i]);
  return btoa(binary);
}

/** Browser-safe base64 → Uint8Array */
function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Verify integrity of reassembled data against the CRC in metadata */
export function verifyCrc(data: Uint8Array, expectedCrc: string): boolean {
  const actual = ((CRC32.buf(data) >>> 0) as number).toString(16);
  return actual === expectedCrc;
}

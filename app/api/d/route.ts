import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

const TMP_PAYLOADS_DIR = path.join(os.tmpdir(), "beamnet_payloads");

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const pathname = searchParams.get("p") || searchParams.get("pathname");
  const filename = searchParams.get("f") || searchParams.get("filename") || pathname?.split("/").pop() || "downloaded_file";

  if (!pathname) {
    return NextResponse.json({ error: "Missing file parameter 'p'" }, { status: 400 });
  }

  // 1. Check local disk payload store first (/tmp/beamnet_payloads/)
  const cleanPath = pathname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const diskPath = path.join(TMP_PAYLOADS_DIR, cleanPath);

  if (fs.existsSync(diskPath)) {
    try {
      const fileBuffer = fs.readFileSync(diskPath);
      return new Response(fileBuffer, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"; filename*=${encodeURIComponent(filename)}`,
          "Content-Length": fileBuffer.length.toString(),
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch {
      /* fallback to Blob */
    }
  }

  // 2. Fallback to Vercel Blob persistent store
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (token) {
      const result = await get(pathname, { access: "public", token }).catch(() => null);
      if (result && result.stream) {
        return new Response(result.stream as unknown as ReadableStream, {
          headers: {
            "Content-Type": result.blob.contentType || "application/octet-stream",
            "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"; filename*=${encodeURIComponent(filename)}`,
            "Cache-Control": "public, max-age=86400",
          },
        });
      }
    }
  } catch {
    /* ignore blob error */
  }

  return NextResponse.json({ error: "File not found or expired" }, { status: 404 });
}

import { NextResponse } from "next/server";
import { put, get, list } from "@vercel/blob";

export interface FileItem {
  name: string;
  url: string;
  size: number;
  type: string;
  pathname?: string;
}

export interface CodeEntry {
  code: string;
  files: FileItem[];
  fileUrl: string;
  pathname?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  expiresAt: number;
}

// Global server memory store for 6-digit codes
const codeStore = new Map<string, CodeEntry>();

// Cleanup expired entries periodically
function cleanupExpiredCodes() {
  const now = Date.now();
  for (const [code, entry] of codeStore.entries()) {
    if (now > entry.expiresAt) {
      codeStore.delete(code);
    }
  }
}

// Generate unique random 6-digit code (100000 - 999999)
function generate6DigitCode(): string {
  cleanupExpiredCodes();
  let code: string;
  let attempts = 0;
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
    attempts++;
  } while (codeStore.has(code) && attempts < 1000);
  return code;
}

// POST /api/code: Store single file or array of files & return 6-digit passkey
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { files: incomingFiles, fileUrl, pathname, fileName, fileSize, mimeType, code: requestedCode } = body;

    let files: FileItem[] = [];

    if (Array.isArray(incomingFiles) && incomingFiles.length > 0) {
      files = incomingFiles.map((f: any) => ({
        name: f.name || f.fileName || "file",
        url: f.url || f.fileUrl || "",
        size: Number(f.size || f.fileSize) || 0,
        type: f.type || f.mimeType || "application/octet-stream",
        pathname: f.pathname || "",
      }));
    } else if (fileName) {
      files = [
        {
          name: fileName,
          url: fileUrl || "",
          size: Number(fileSize) || 0,
          type: mimeType || "application/octet-stream",
          pathname: pathname || "",
        },
      ];
    } else {
      return NextResponse.json({ error: "Missing file parameters" }, { status: 400 });
    }

    const code = requestedCode || generate6DigitCode();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes TTL

    const primaryFile = files[0];
    const entry: CodeEntry = {
      code,
      files,
      fileUrl: primaryFile.url,
      pathname: primaryFile.pathname || "",
      fileName: primaryFile.name,
      fileSize: primaryFile.size,
      mimeType: primaryFile.type,
      expiresAt,
    };

    // Store in local lambda memory
    codeStore.set(code, entry);

    // Persist to Vercel Blob so ANY serverless instance can resolve it
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (token) {
      const blobPath = `codes/${code}.json`;
      const blobContent = JSON.stringify(entry);

      try {
        await put(blobPath, blobContent, {
          access: "private",
          token,
          addRandomSuffix: false,
        });
      } catch {
        try {
          await put(blobPath, blobContent, {
            access: "public",
            token,
            addRandomSuffix: false,
          });
        } catch (err2) {
          console.warn("Vercel Blob passkey persistence warning:", err2);
        }
      }
    }

    return NextResponse.json({
      success: true,
      code,
      count: files.length,
      files,
      expiresAt,
      ttlSeconds: 15 * 60,
    });
  } catch (error) {
    console.error("Code generation error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// GET /api/code?code=849201: Resolve 6-digit passkey to file payload (single or batch)
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code")?.trim();

  if (!code || code.length !== 6) {
    return NextResponse.json({ error: "Invalid 6-digit code format" }, { status: 400 });
  }

  cleanupExpiredCodes();

  let entry: CodeEntry | undefined = codeStore.get(code);

  // If not in local memory, check Vercel Blob persistent store
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!entry && token) {
    const blobPath = `codes/${code}.json`;
    try {
      const blobResult = await get(blobPath, { access: "private", token }).catch(() => null);
      if (blobResult && blobResult.stream) {
        const text = await new Response(blobResult.stream as unknown as ReadableStream).text();
        entry = JSON.parse(text) as CodeEntry;
      }
    } catch {
      /* ignore SDK get error */
    }

    if (!entry) {
      try {
        const { blobs } = await list({
          prefix: `codes/${code}`,
          token,
        });

        if (blobs.length > 0) {
          const downloadUrl = blobs[0].downloadUrl || blobs[0].url;
          const res = await fetch(downloadUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (res.ok) {
            entry = (await res.json()) as CodeEntry;
          }
        }
      } catch (listErr) {
        console.warn("Vercel Blob passkey list error:", listErr);
      }
    }

    if (entry && entry.expiresAt > Date.now()) {
      codeStore.set(code, entry);
    }
  }

  if (!entry) {
    return NextResponse.json({ error: "Code not found or expired" }, { status: 404 });
  }

  if (Date.now() > entry.expiresAt) {
    codeStore.delete(code);
    return NextResponse.json({ error: "Code has expired" }, { status: 404 });
  }

  const normalizedFiles = Array.isArray(entry.files) && entry.files.length > 0
    ? entry.files
    : [
        {
          name: entry.fileName,
          url: entry.fileUrl,
          size: entry.fileSize,
          type: entry.mimeType,
          pathname: entry.pathname,
        },
      ];

  return NextResponse.json({
    success: true,
    code: entry.code,
    files: normalizedFiles,
    fileUrl: entry.fileUrl,
    pathname: entry.pathname,
    fileName: entry.fileName,
    fileSize: entry.fileSize,
    mimeType: entry.mimeType,
    expiresAt: entry.expiresAt,
  });
}

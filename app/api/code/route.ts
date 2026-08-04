import { NextResponse } from "next/server";
import { put, list } from "@vercel/blob";

interface CodeEntry {
  code: string;
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

// POST /api/code: Store payload metadata & return 6-digit passkey
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { fileUrl, pathname, fileName, fileSize, mimeType } = body;

    if (!fileName) {
      return NextResponse.json({ error: "Missing file parameters" }, { status: 400 });
    }

    const code = generate6DigitCode();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes TTL

    const entry: CodeEntry = {
      code,
      fileUrl: fileUrl || "",
      pathname: pathname || "",
      fileName,
      fileSize: Number(fileSize) || 0,
      mimeType: mimeType || "application/octet-stream",
      expiresAt,
    };

    // Store in local lambda memory
    codeStore.set(code, entry);

    // Persist to Vercel Blob if token available so ANY serverless instance can resolve it
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (token) {
      try {
        await put(`codes/${code}.json`, JSON.stringify(entry), {
          access: "public",
          token,
          addRandomSuffix: false,
        });
      } catch (blobErr) {
        console.warn("Vercel Blob code persistence warning:", blobErr);
      }
    }

    return NextResponse.json({
      success: true,
      code,
      expiresAt,
      ttlSeconds: 15 * 60,
    });
  } catch (error) {
    console.error("Code generation error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// GET /api/code?code=849201: Resolve 6-digit passkey to file payload
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
    try {
      const { blobs } = await list({
        prefix: `codes/${code}.json`,
        token,
      });

      if (blobs.length > 0) {
        const res = await fetch(blobs[0].url);
        if (res.ok) {
          entry = (await res.json()) as CodeEntry;
          if (entry && entry.expiresAt > Date.now()) {
            codeStore.set(code, entry); // cache in local memory
          }
        }
      }
    } catch (blobErr) {
      console.warn("Error fetching code from Vercel Blob:", blobErr);
    }
  }

  if (!entry) {
    return NextResponse.json({ error: "Code not found or expired" }, { status: 404 });
  }

  if (Date.now() > entry.expiresAt) {
    codeStore.delete(code);
    return NextResponse.json({ error: "Code has expired" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    code: entry.code,
    fileUrl: entry.fileUrl,
    pathname: entry.pathname,
    fileName: entry.fileName,
    fileSize: entry.fileSize,
    mimeType: entry.mimeType,
    expiresAt: entry.expiresAt,
  });
}

import { PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { s3, BUCKET } from "@/lib/s3";

interface CodeEntry {
  code: string;
  fileUrl: string;
  pathname?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  expiresAt: number;
}

// In-process cache for this serverless instance
const codeStore = new Map<string, CodeEntry>();

function cleanupExpiredCodes() {
  const now = Date.now();
  for (const [code, entry] of codeStore.entries()) {
    if (now > entry.expiresAt) codeStore.delete(code);
  }
}

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

// ── POST /api/code ── generate passkey & persist to S3
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { fileUrl, pathname, fileName, fileSize, mimeType } = body;

    if (!fileName) {
      return NextResponse.json({ error: "Missing file parameters" }, { status: 400 });
    }

    const code = generate6DigitCode();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 min TTL

    const entry: CodeEntry = {
      code,
      fileUrl: fileUrl || "",
      pathname: pathname || "",
      fileName,
      fileSize: Number(fileSize) || 0,
      mimeType: mimeType || "application/octet-stream",
      expiresAt,
    };

    codeStore.set(code, entry);

    // Persist to S3 so any cold Lambda instance can resolve the code
    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: `codes/${code}.json`,
          Body: JSON.stringify(entry),
          ContentType: "application/json",
        })
      );
    } catch (s3Err) {
      console.warn("S3 passkey persistence warning:", s3Err);
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

// ── GET /api/code?code=XXXXXX ── resolve passkey
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code")?.trim();

  if (!code || code.length !== 6) {
    return NextResponse.json({ error: "Invalid 6-digit code format" }, { status: 400 });
  }

  cleanupExpiredCodes();

  let entry: CodeEntry | undefined = codeStore.get(code);

  // Not in local memory — fetch from S3
  if (!entry) {
    try {
      const result = await s3.send(
        new GetObjectCommand({
          Bucket: BUCKET,
          Key: `codes/${code}.json`,
        })
      );
      if (result.Body) {
        const text = await result.Body.transformToString();
        entry = JSON.parse(text) as CodeEntry;
      }
    } catch {
      // Key not found — try list prefix scan as fallback
      try {
        const listResult = await s3.send(
          new ListObjectsV2Command({
            Bucket: BUCKET,
            Prefix: `codes/${code}`,
            MaxKeys: 1,
          })
        );
        if (listResult.Contents && listResult.Contents.length > 0) {
          const key = listResult.Contents[0].Key!;
          const getResult = await s3.send(
            new GetObjectCommand({ Bucket: BUCKET, Key: key })
          );
          if (getResult.Body) {
            const text = await getResult.Body.transformToString();
            entry = JSON.parse(text) as CodeEntry;
          }
        }
      } catch (listErr) {
        console.warn("S3 passkey list fallback error:", listErr);
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

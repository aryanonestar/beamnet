import { list } from '@vercel/blob';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TMP_STORE_PATH = path.join(os.tmpdir(), "beamnet_codes_v1.json");

function getFromDisk(code: string) {
  try {
    if (fs.existsSync(TMP_STORE_PATH)) {
      const raw = fs.readFileSync(TMP_STORE_PATH, "utf-8");
      const current = JSON.parse(raw);
      const found = current[code];
      if (found && found.expiresAt > Date.now()) {
        return found;
      }
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code')?.trim();

  if (!code || code.length !== 6) {
    return NextResponse.json({ error: 'Missing or invalid 6-digit code' }, { status: 400 });
  }

  // 1. Try disk store lookup
  const diskEntry = getFromDisk(code);
  if (diskEntry) {
    return NextResponse.json(diskEntry, { status: 200 });
  }

  // 2. Try Vercel Blob store
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    for (const prefix of [`passkeys/${code}`, `codes/${code}`]) {
      try {
        const { blobs } = await list({ prefix, token }).catch(() => ({ blobs: [] }));
        if (blobs && blobs.length > 0) {
          const metadataUrl = blobs[0].downloadUrl || blobs[0].url;
          const res = await fetch(metadataUrl);
          if (res.ok) {
            const metadata = await res.json();
            return NextResponse.json(metadata, { status: 200 });
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  // 3. Fallback to internal /api/code route
  try {
    const origin = new URL(request.url).origin;
    const codeRes = await fetch(`${origin}/api/code?code=${code}`);
    if (codeRes.ok) {
      const data = await codeRes.json();
      return NextResponse.json(data, { status: 200 });
    }
  } catch {
    /* ignore */
  }

  return NextResponse.json({ error: 'Passkey not found or expired' }, { status: 404 });
}

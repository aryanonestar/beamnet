import { list } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code')?.trim();

  if (!code || code.length !== 6) {
    return NextResponse.json({ error: 'Missing or invalid 6-digit code' }, { status: 400 });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;

  try {
    // 1. Try public passkeys/${code} or codes/${code} blob prefix search
    if (token) {
      for (const prefix of [`passkeys/${code}`, `codes/${code}`]) {
        const { blobs } = await list({ prefix, token }).catch(() => ({ blobs: [] }));
        if (blobs && blobs.length > 0) {
          const metadataUrl = blobs[0].downloadUrl || blobs[0].url;
          const res = await fetch(metadataUrl);
          if (res.ok) {
            const metadata = await res.json();
            return NextResponse.json(metadata, { status: 200 });
          }
        }
      }
    }

    // 2. Fallback to internal /api/code lookup
    const origin = new URL(request.url).origin;
    const codeRes = await fetch(`${origin}/api/code?code=${code}`);
    if (codeRes.ok) {
      const data = await codeRes.json();
      return NextResponse.json(data, { status: 200 });
    }

    return NextResponse.json({ error: 'Passkey not found or expired' }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Passkey lookup error' }, { status: 500 });
  }
}

import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TMP_PAYLOADS_DIR = path.join(os.tmpdir(), "beamnet_payloads");

function ensureTmpDir() {
  try {
    if (!fs.existsSync(TMP_PAYLOADS_DIR)) {
      fs.mkdirSync(TMP_PAYLOADS_DIR, { recursive: true });
    }
  } catch {
    /* ignore */
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const contentType = request.headers.get('content-type') || '';

  // 1. If Vercel Blob token is available and request is client-token JSON
  if (token && contentType.includes('application/json')) {
    try {
      const body = (await request.json()) as HandleUploadBody;
      if ((body as { type?: string }).type === 'blob.upload-completed') {
        return NextResponse.json({ ok: true });
      }
      const jsonResponse = await handleUpload({
        body,
        request,
        onBeforeGenerateToken: async () => ({
          allowedContentTypes: ['*/*'],
          maximumSizeInBytes: 500 * 1024 * 1024,
          tokenPayload: JSON.stringify({ uploadedAt: new Date().toISOString() }),
        }),
        onUploadCompleted: async () => {},
      });
      return NextResponse.json(jsonResponse);
    } catch (err) {
      console.warn('[BEAM-NET] handleUpload fallback to direct stream:', err);
    }
  }

  // 2. Direct Stream upload (Works with OR without BLOB_READ_WRITE_TOKEN!)
  try {
    const fileName = request.headers.get('x-filename') || `file_${Date.now()}.bin`;
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');

    ensureTmpDir();
    const diskPath = path.join(TMP_PAYLOADS_DIR, cleanFileName);

    // Save binary stream to OS temp disk
    const arrayBuffer = await request.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(diskPath, buffer);

    let publicUrl = `/api/d?p=${encodeURIComponent(cleanFileName)}&f=${encodeURIComponent(fileName)}`;

    // If Vercel Blob token exists, also put to Vercel Blob
    if (token) {
      try {
        const blob = await put(fileName, buffer, {
          access: 'public',
          token,
          addRandomSuffix: true,
        });
        if (blob && blob.url) {
          publicUrl = blob.url;
        }
      } catch (blobErr) {
        console.warn('[BEAM-NET] Blob put warning:', blobErr);
      }
    }

    return NextResponse.json({
      url: publicUrl,
      pathname: cleanFileName,
      size: buffer.length,
    });
  } catch (error) {
    console.error('[BEAM-NET] Upload error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

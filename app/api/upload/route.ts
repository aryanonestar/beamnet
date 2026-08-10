import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
// No body size limit on route handlers — they stream via Node.js
// (Only Server Actions have the 4.5MB default limit)

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const contentType = request.headers.get('content-type') || 'application/octet-stream';
    const fileName = request.headers.get('x-filename') || 'upload';
    const token = process.env.BLOB_READ_WRITE_TOKEN;

    if (!token) {
      return NextResponse.json({ error: 'Storage not configured' }, { status: 500 });
    }

    // Stream the request body directly into Vercel Blob (server-side put)
    // This avoids ALL client-SDK issues: no completion callbacks, no cold-start races,
    // no JWT token extraction, no multipart orchestration on the client.
    const blob = await put(fileName, request.body as ReadableStream, {
      access: 'public',
      token,
      addRandomSuffix: true,
      contentType,
    });

    return NextResponse.json({ url: blob.url, pathname: blob.pathname });
  } catch (error) {
    console.error('[BEAM-NET] Stream upload error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

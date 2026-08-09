import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

const uploadConfig = {
  onBeforeGenerateToken: async () => ({
    allowedContentTypes: ['*/*'],
    maximumSizeInBytes: 500 * 1024 * 1024, // 500 MB
    addRandomSuffix: true,
    tokenPayload: JSON.stringify({ uploadedAt: new Date().toISOString() }),
  }),
  onUploadCompleted: async ({ blob }: { blob: { url: string } }) => {
    console.log('[BEAM-NET] Upload completed:', blob.url);
  },
};

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  // ── CRITICAL FIX: For completion events, respond INSTANTLY (fire-and-forget).
  // The client SDK only needs a 2xx here — it never reads the response body.
  // Without this, the SDK awaits a potentially cold-starting serverless function,
  // causing the upload to hang silently at 94–99% forever.
  if ((body as { type?: string }).type === 'blob.upload-completed') {
    // Fire the completion handler in background so the log still happens
    handleUpload({ body, request, ...uploadConfig }).catch(() => null);
    // Return instantly — unblocks the client SDK immediately
    return NextResponse.json({ ok: true });
  }

  // ── For token-generation events: wait normally so the client gets its token ──
  try {
    const jsonResponse = await handleUpload({ body, request, ...uploadConfig });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error('[BEAM-NET] Blob upload token error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}

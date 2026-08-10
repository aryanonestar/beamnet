import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  // Fire-and-forget instant ACK for upload completion callback to prevent cold-start freezes
  if ((body as { type?: string }).type === 'blob.upload-completed') {
    handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({ allowedContentTypes: ['*/*'] }),
      onUploadCompleted: async () => {},
    }).catch(() => null);
    return NextResponse.json({ ok: true });
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        return {
          allowedContentTypes: ['*/*'],
          maximumSizeInBytes: 500 * 1024 * 1024, // 500 MB max limit
          tokenPayload: JSON.stringify({ uploadedAt: new Date().toISOString() }),
        };
      },
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error('[BEAM-NET] Token generation error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}

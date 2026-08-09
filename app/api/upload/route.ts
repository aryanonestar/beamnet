import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['*/*'],
        maximumSizeInBytes: 500 * 1024 * 1024, // 500 MB max limit
        addRandomSuffix: true, // Prevents duplicate filename collision errors
        tokenPayload: JSON.stringify({
          uploadedAt: new Date().toISOString(),
        }),
      }),
      onUploadCompleted: async ({ blob }) => {
        console.log('[BEAM-NET] Direct client upload completed:', blob.url);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error('Blob upload token error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}

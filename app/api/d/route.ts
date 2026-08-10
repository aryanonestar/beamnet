import { get } from "@vercel/blob";
import { NextResponse } from "next/server";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const pathname = searchParams.get("p") || searchParams.get("pathname");
  const filename = searchParams.get("f") || searchParams.get("filename") || pathname?.split("/").pop() || "downloaded_file";

  if (!pathname) {
    return NextResponse.json({ error: "Missing file parameter 'p'" }, { status: 400 });
  }

  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    const result = await get(pathname, {
      access: "private",
      token,
    });

    if (!result || !result.stream) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Force browser to automatically trigger download without requiring button clicks
    return new Response(result.stream as unknown as ReadableStream, {
      headers: {
        "Content-Type": result.blob.contentType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"; filename*=${encodeURIComponent(filename)}`,
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Direct download route error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

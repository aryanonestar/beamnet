import { get } from "@vercel/blob";
import { NextResponse } from "next/server";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const pathname = searchParams.get("pathname");
  const filename = searchParams.get("filename") || pathname?.split("/").pop() || "downloaded_file";

  if (!pathname) {
    return NextResponse.json({ error: "Missing pathname parameter" }, { status: 400 });
  }

  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    const result = await get(pathname, {
      access: "private",
      token,
    });

    if (!result || !result.stream) {
      return NextResponse.json({ error: "Blob stream not found" }, { status: 404 });
    }

    return new Response(result.stream as unknown as ReadableStream, {
      headers: {
        "Content-Type": result.blob.contentType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Private Blob serve error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 404 });
  }
}

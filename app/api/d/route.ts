import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { s3, BUCKET } from "@/lib/s3";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const pathname = searchParams.get("p") || searchParams.get("pathname");
  const filename =
    searchParams.get("f") ||
    searchParams.get("filename") ||
    pathname?.split("/").pop() ||
    "downloaded_file";

  if (!pathname) {
    return NextResponse.json({ error: "Missing file parameter 'p'" }, { status: 400 });
  }

  try {
    const result = await s3.send(
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: pathname,
      })
    );

    if (!result.Body) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const stream = result.Body.transformToWebStream();

    return new Response(stream, {
      headers: {
        "Content-Type": result.ContentType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"; filename*=${encodeURIComponent(filename)}`,
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("S3 direct download error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

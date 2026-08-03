import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const filename = (formData.get("filename") as string) || file?.name || "payload.bin";

    if (!file) {
      return NextResponse.json({ error: "No file provided in form data" }, { status: 400 });
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    
    // Put file with addRandomSuffix: true to prevent filename collisions
    let blob;
    try {
      blob = await put(filename, file, {
        access: "public",
        token,
        addRandomSuffix: true,
      });
    } catch {
      // Fallback if store requires private access
      blob = await put(filename, file, {
        access: "private",
        token,
        addRandomSuffix: true,
      });
    }

    return NextResponse.json({
      url: blob.url,
      downloadUrl: blob.downloadUrl || blob.url,
      pathname: blob.pathname,
      contentType: blob.contentType,
    });
  } catch (error) {
    console.error("Vercel Blob upload failed:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { s3, BUCKET } from "@/lib/s3";
import { randomBytes } from "crypto";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const filename = (formData.get("filename") as string) || file?.name || "payload.bin";

    if (!file) {
      return NextResponse.json({ error: "No file provided in form data" }, { status: 400 });
    }

    // Add random suffix to prevent collisions (mirrors Vercel Blob addRandomSuffix)
    const suffix = randomBytes(4).toString("hex");
    const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : "";
    const base = filename.includes(".") ? filename.slice(0, filename.lastIndexOf(".")) : filename;
    const key = `uploads/${base}-${suffix}${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buffer,
        ContentType: file.type || "application/octet-stream",
      })
    );

    // pathname mirrors the Vercel Blob pathname field used downstream
    const pathname = key;
    const url = `https://${BUCKET}.s3.amazonaws.com/${key}`;

    return NextResponse.json({
      url,
      downloadUrl: url,
      pathname,
      contentType: file.type || "application/octet-stream",
    });
  } catch (error) {
    console.error("S3 upload failed:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

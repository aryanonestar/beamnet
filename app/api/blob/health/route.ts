import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { s3, BUCKET } from "@/lib/s3";

export async function GET(): Promise<NextResponse> {
  const region = process.env.APP_AWS_REGION ?? "us-east-1";
  const keyId = process.env.APP_AWS_ACCESS_KEY_ID;
  const secret = process.env.APP_AWS_SECRET_ACCESS_KEY;

  if (!keyId || !secret) {
    return NextResponse.json(
      { ready: false, error: "AWS credentials not configured" },
      { status: 200 }
    );
  }

  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    return NextResponse.json({ ready: true, bucket: BUCKET, region });
  } catch (error) {
    return NextResponse.json(
      { ready: false, error: (error as Error).message },
      { status: 200 }
    );
  }
}

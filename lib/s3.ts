import { S3Client } from "@aws-sdk/client-s3";

export const s3 = new S3Client({
  region: process.env.APP_AWS_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
  },
});

export const BUCKET = process.env.S3_BUCKET_NAME ?? "beamnet-storage";

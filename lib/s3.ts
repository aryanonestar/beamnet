import { S3Client } from "@aws-sdk/client-s3";

export const BUCKET = process.env.S3_BUCKET_NAME ?? "beamnet-storage";

// Factory function — creates a fresh client per call so env vars are
// always read at request time, not at cold-start module load time.
export function getS3Client(): S3Client {
  return new S3Client({
    region: process.env.APP_AWS_REGION ?? "us-east-1",
    credentials: {
      accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
    },
  });
}

// Convenience singleton — still works when env vars are present at boot.
export const s3 = getS3Client();

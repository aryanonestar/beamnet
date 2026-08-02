import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token && token.trim().length > 0) {
    return NextResponse.json({
      ready: true,
      storeId: "store_Uuhi1JVtHqWZuScC",
    });
  }
  return NextResponse.json({ ready: false, error: "BLOB_READ_WRITE_TOKEN missing" }, { status: 200 });
}

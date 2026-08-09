import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const sharedFiles = formData.getAll("shared_files") as File[];

    if (!sharedFiles || sharedFiles.length === 0) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    // Pass incoming files back to the homepage via redirect URL parameter
    const redirectUrl = new URL("/", request.url);
    redirectUrl.searchParams.set("pwa_share", "true");

    return NextResponse.redirect(redirectUrl, 303);
  } catch (err) {
    console.error("Error handling Web Share Target payload:", err);
    return NextResponse.redirect(new URL("/", request.url));
  }
}

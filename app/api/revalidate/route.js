import { NextResponse } from "next/server";
import { getBrand }    from "@/lib/brands";

const SECRET = process.env.REVALIDATE_SECRET;

export async function POST(req) {
  try {
    const { brand, slug, secret } = await req.json();

    if (SECRET && secret !== SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const brandConfig = getBrand(brand);
    if (!brandConfig) {
      return NextResponse.json({ error: "Unknown brand" }, { status: 400 });
    }

    // Call the brand's own deployed site to trigger ISR revalidation
    const siteUrl = brandConfig.siteUrl;
    const revalSecret = brandConfig.revalidateSecret;

    if (siteUrl) {
      try {
        const body = JSON.stringify({ slug, secret: revalSecret });
        await fetch(`${siteUrl}/api/revalidate`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
      } catch (err) {
        // Non-fatal: brand site may not be deployed yet
        console.warn(`[revalidate] Failed to reach ${siteUrl}:`, err.message);
      }
    }

    return NextResponse.json({ revalidated: true, brand, slug: slug || "all" });
  } catch (err) {
    console.error("[revalidate]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

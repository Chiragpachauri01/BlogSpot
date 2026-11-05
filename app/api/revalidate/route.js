import { NextResponse } from "next/server";
import { adminAuth }    from "@/firebase/firebase.admin";
import { getBrand }     from "@/lib/brands";
import { isAllowedAdminEmail } from "@/lib/allowedAdmins";

// Called by the admin editors (lib/revalidateSite.js) after a save or delete.
// The caller proves it's a signed-in admin with its Firebase ID token — the same
// checks as components/admin/AdminProtected — and this route forwards to the
// brand site with that site's secret, which never leaves the server.
export async function POST(req) {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
    let user;
    try {
      user = await adminAuth.verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { brand, slug, type } = await req.json();

    if (!user.admin || !isAllowedAdminEmail(user.email) || (user.brand && user.brand !== brand)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const brandConfig = getBrand(brand);
    if (!brandConfig) {
      return NextResponse.json({ error: "Unknown brand" }, { status: 400 });
    }

    // Call the brand's own deployed site to trigger ISR revalidation.
    // `type` lets the brand site pick the right path: blogs (default) or web stories.
    const { siteUrl, revalidateSecret } = brandConfig;
    if (!siteUrl) {
      return NextResponse.json({ error: `No site URL configured for ${brand}` }, { status: 500 });
    }

    const res = await fetch(`${siteUrl}/api/revalidate`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ slug, secret: revalidateSecret, type }),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `${siteUrl} answered ${res.status}` }, { status: 502 });
    }

    return NextResponse.json({ revalidated: true, brand, type: type || "blog", slug: slug || "all" });
  } catch (err) {
    console.error("[revalidate]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

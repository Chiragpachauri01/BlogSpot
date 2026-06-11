import { NextResponse } from "next/server";
import { adminAuth }    from "@/firebase/firebase.admin";

const VALID_BRANDS = ["quick-cleaning", "shark-web-digital", "dryclean-master"];

export async function POST(request) {
  try {
    const secret = request.headers.get("x-admin-setup-secret");
    if (!process.env.ADMIN_SETUP_SECRET || secret !== process.env.ADMIN_SETUP_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { uid, email, brand, superAdmin } = body || {};

    if (!uid && !email) {
      return NextResponse.json({ error: "Provide either uid or email" }, { status: 400 });
    }
    if (brand && !VALID_BRANDS.includes(brand)) {
      return NextResponse.json({ error: `Invalid brand. Valid: ${VALID_BRANDS.join(", ")}` }, { status: 400 });
    }

    const userRecord = uid
      ? await adminAuth.getUser(uid)
      : await adminAuth.getUserByEmail(email);

    // Build claims: admin + optional brand restriction
    // - No brand → superAdmin with access to all brands
    // - brand set → restricted to that brand only
    const newClaims = { ...(userRecord.customClaims || {}), admin: true };
    if (brand)      newClaims.brand      = brand;
    if (superAdmin) newClaims.superAdmin = true;

    await adminAuth.setCustomUserClaims(userRecord.uid, newClaims);

    return NextResponse.json({
      success: true,
      uid:     userRecord.uid,
      email:   userRecord.email,
      claims:  newClaims,
      note:    "User must sign out and sign back in for the claim to take effect.",
    });
  } catch (err) {
    console.error("set-admin-claim error:", err);
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}

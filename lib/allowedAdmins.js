// Emails allowed to access Blog Master, from NEXT_PUBLIC_ALLOWED_ADMIN_EMAILS (comma-separated).
// An empty list means no restriction (any user with the admin claim).
const ALLOWED_EMAILS = (process.env.NEXT_PUBLIC_ALLOWED_ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAllowedAdminEmail(email) {
  if (!ALLOWED_EMAILS.length) return true;
  return ALLOWED_EMAILS.includes((email || "").toLowerCase());
}

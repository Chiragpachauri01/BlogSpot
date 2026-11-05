import { auth } from "@/firebase/firebase.auth";

// Asks the brand site to re-render the pages showing a post or story, via
// app/api/revalidate. Brand sites have no revalidate timer, so this is the only
// way a save or delete reaches them. Resolves to null, or an error message the
// editor should show.
export async function revalidateSite({ brand, slug, type }) {
  try {
    const token = await auth.currentUser?.getIdToken();
    // Trailing slash: next.config sets trailingSlash, and the bare path 308s.
    const res = await fetch("/api/revalidate/", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ brand, slug, type }),
    });
    if (res.ok) return null;
    const { error } = await res.json().catch(() => ({}));
    return error || `HTTP ${res.status}`;
  } catch (err) {
    return err.message;
  }
}

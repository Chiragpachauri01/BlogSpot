/**
 * BlogUtils.js
 * Shared utilities for the blog system — quickcleaningservices.in
 */

// ─── Date formatting ──────────────────────────────────────────────────────────
export function formatDate(ts, style = "long") {
  if (!ts) return "";
  let date;
  if (ts?.toDate) date = ts.toDate();
  else if (ts instanceof Date) date = ts;
  else date = new Date(ts);
  if (isNaN(date.getTime())) return "";

  if (style === "relative") {
    const diff = Date.now() - date.getTime();
    const secs = Math.floor(diff / 1000);
    const mins = Math.floor(secs / 60);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);
    if (secs < 60) return "just now";
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    if (weeks < 5) return `${weeks}w ago`;
    if (months < 12) return `${months}mo ago`;
    return `${years}y ago`;
  }
  if (style === "short")
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function toISOString(ts) {
  if (!ts) return "";
  if (ts?.toDate) return ts.toDate().toISOString();
  if (ts instanceof Date) return ts.toISOString();
  return new Date(ts).toISOString();
}

// ─── Reading time ─────────────────────────────────────────────────────────────
export function calcReadingTime(html = "") {
  const text = html.replace(/<[^>]+>/g, " ");
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

// ─── Related posts ────────────────────────────────────────────────────────────
export function getRelatedPosts(current, all, limit = 3) {
  if (!current || !all?.length) return [];
  const currentTags = new Set((current.tags || []).map((t) => t.toLowerCase()));
  return all
    .filter((b) => b.id !== current.id && b.status === "published")
    .map((b) => ({
      ...b,
      _overlap: (b.tags || []).filter((t) => currentTags.has(t.toLowerCase())).length,
    }))
    .filter((b) => b._overlap > 0)
    .sort((a, b) => b._overlap - a._overlap)
    .slice(0, limit)
    .map(({ _overlap, ...b }) => b);
}

// ─── TOC generation (regex-based, SSR-safe) ───────────────────────────────────
export function generateTOC(html = "") {
  if (!html) return [];
  const entries = [];
  const re = /<h([1-3])\s[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const level = parseInt(match[1], 10);
    const id = match[2];
    const rawText = match[3].replace(/<[^>]+>/g, "").trim();
    if (rawText) entries.push({ id, text: rawText, level });
  }
  return entries;
}

// Regex-based — works on both server (SSR/ISR) and client.
export function addIdsToHeadings(html) {
  if (!html) return html;
  let i = 0;
  return html.replace(
    /<(h[1-4])((?:\s[^>]*)?)?>([\s\S]*?)<\/h\1>/gi,
    (match, tag, attrs = "", inner) => {
      if (/\bid\s*=/i.test(attrs)) return match;
      const text = inner
        .replace(/<[^>]+>/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      const id = text || `heading-${i++}`;
      return `<${tag}${attrs} id="${id}">${inner}</${tag}>`;
    }
  );
}

// ─── Slug helpers ─────────────────────────────────────────────────────────────
export function slugify(text = "") {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().replace(/\s+/g, "-");
}

// ─── Tag utilities ────────────────────────────────────────────────────────────
export function collectAllTags(posts = []) {
  const set = new Set();
  for (const p of posts) for (const t of p.tags || []) set.add(t.toLowerCase());
  return [...set].sort();
}

// ─── Excerpt helper ───────────────────────────────────────────────────────────
export function autoExcerpt(html = "", maxLength = 155) {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).replace(/\s+\S*$/, "") + "…";
}

// ─── Layout list ─────────────────────────────────────────────────────────────
export const BLOG_LAYOUTS = [
  { value: "default",  label: "Default",  desc: "Clean centered blog" },
  { value: "minimal",  label: "Minimal",  desc: "Narrow deep-reading experience" },
  { value: "magazine", label: "Magazine", desc: "Editorial layout with large hero" },
  { value: "docs",     label: "Docs",     desc: "Sidebar TOC for tutorials" },
  { value: "cards",    label: "Cards",    desc: "Section-based card layout" },
  { value: "hero",     label: "Hero",     desc: "Full-width hero storytelling" },
  { value: "timeline", label: "Timeline", desc: "Step-by-step vertical flow" },
];

// ─── Social share URLs ────────────────────────────────────────────────────────
export function shareLinks(url, title) {
  const encoded = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  const encodedText = encodeURIComponent(`${title} - ${url}`);
  return {
    twitter:   `https://twitter.com/intent/tweet?url=${encoded}&text=${encodedTitle}`,
    linkedin:  `https://www.linkedin.com/sharing/share-offsite/?url=${encoded}`,
    facebook:  `https://www.facebook.com/sharer/sharer.php?u=${encoded}`,
    whatsapp:  `https://api.whatsapp.com/send?text=${encodedText}`,
  };
}

// ─── FAQ extraction from HTML ─────────────────────────────────────────────────
/**
 * Extract FAQ pairs from HTML.
 * Looks for <h3> or <strong> followed by <p> in a pattern.
 * Returns: [{ question, answer }]
 */
export function extractFAQs(html = "") {
  if (!html) return [];
  const faqs = [];

  // Strategy 1: Look for elements with class "faq" or id containing "faq"
  // Strategy 2: Look for <h3> that contain "?" followed by <p>
  const re = /<h[23][^>]*>([\s\S]*?)<\/h[23]>\s*<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const question = match[1].replace(/<[^>]+>/g, "").trim();
    const answer = match[2].replace(/<[^>]+>/g, "").trim();
    if (question.includes("?") && answer.length > 10) {
      faqs.push({ question, answer });
    }
  }
  return faqs.slice(0, 10);
}

// ─── FAQ Schema ───────────────────────────────────────────────────────────────
export function generateFAQSchema(faqs = []) {
  if (!faqs.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

// ─── Split HTML into sections at h2 boundaries ───────────────────────────────
export function splitIntoSections(html) {
  if (!html) return [{ heading: null, id: null, html: "" }];
  const sections = [];
  const parts = html.split(/(?=<h2[\s>])/gi);
  for (const part of parts) {
    if (!part.trim()) continue;
    const headingMatch = part.match(/<h2[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/h2>/i);
    if (headingMatch) {
      const id = headingMatch[1];
      const heading = headingMatch[2].replace(/<[^>]+>/g, "").trim();
      const body = part.slice(headingMatch[0].length);
      sections.push({ heading, id, html: body });
    } else {
      sections.push({ heading: null, id: null, html: part });
    }
  }
  return sections;
}
// ─── Freshness ────────────────────────────────────────────────────────────────
// True when the post was edited more than a day after it was first published,
// so same-day typo fixes don't show an "Updated" label.
export function isMeaningfullyUpdated(createdAt, updatedAt) {
  if (!createdAt || !updatedAt) return false;
  const created = new Date(createdAt).getTime();
  const updated = new Date(updatedAt).getTime();
  if (isNaN(created) || isNaN(updated)) return false;
  return updated - created > 24 * 60 * 60 * 1000;
}

"use client";

/**
 * DownloadCard.jsx — the blog "download" card (e.g. the printable Diwali
 * checklist PDF). Rendered above/below the article by BlogLayouts, or exactly
 * where an editor inserted a Download Card block (data-component="DownloadCard")
 * via BlogContentRenderer. Post data reaches the inline block through
 * BlogDataContext, provided by BlogDetailLayout.
 */

import { createContext, useContext } from "react";
import { safeDownloadUrl } from "./BlogUtils";

export const BlogDataContext = createContext(null);

export const DOWNLOAD_POSITIONS = ["top", "bottom", "both", "none"];

const INLINE_RE = /data-component\s*=\s*["']DownloadCard["']/i;

export function hasInlineDownload(html = "") {
  return INLINE_RE.test(html || "");
}

// Optional CMS download card (e.g. the printable Diwali checklist PDF), shown
// above the article. Only downloadUrl is required; every text has a default.
// Preview image: thumbnail of the file (left on desktop, on top on mobile).
// `at` is where this instance sits: "top" (above the article), "bottom" (after
// it) or "inline" (a Download Card block placed in the content by the editor).
// blog.downloadPosition ("top" | "bottom" | "both" | "none", default "top")
// picks which of top/bottom renders; inline blocks always render.
export function DownloadBox({ blog, at }) {
  const url = safeDownloadUrl(blog.downloadUrl);
  if (!url) return null;
  if (at !== "inline") {
    // Card Position only controls the above/below cards; a Download Card block
    // inserted in the content always renders too (the publisher's choice).
    const position = DOWNLOAD_POSITIONS.includes(blog.downloadPosition) ? blog.downloadPosition : "top";
    if (position === "none" || (position !== "both" && position !== at)) return null;
  }
  const isPdf   = /\.pdf(?:$|[?#])/i.test(url);
  const image   = safeDownloadUrl(blog.downloadImage);
  const eyebrow = blog.downloadEyebrow     || (isPdf ? "Free printable · PDF" : "Free download");
  const title   = blog.downloadLabel       || (isPdf ? "Download the printable version" : "Download");
  const button  = blog.downloadButtonText  || (isPdf ? "Download free PDF" : "Download");
  const linkProps = { href: url, target: "_blank", rel: "noopener", ...(isPdf && { download: "" }) };

  return (
    <aside aria-label={title}
      className="my-10 flex flex-col gap-6 rounded-3xl border-2 border-[#f5a524] bg-[#fdf6ec] p-6 sm:flex-row sm:items-center sm:gap-8 sm:p-8">
      {image && (
        <a {...linkProps} tabIndex={-1} aria-hidden="true"
          className="mx-auto block w-48 shrink-0 sm:mx-0 sm:w-40 md:w-48">
          {/* eslint-disable-next-line @next/next/no-img-element -- CMS URL; host may not be in images.remotePatterns */}
          <img src={image} alt="" width={600} height={847} loading="lazy" decoding="async"
            className="h-auto w-full rounded-xl shadow-lg ring-1 ring-black/5" />
        </a>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#f26b1d] sm:text-sm">{eyebrow}</p>
        <p className="mt-2 text-2xl font-black leading-tight tracking-tight text-[#0f2a47] sm:text-3xl">{title}</p>
        {blog.downloadDescription && (
          <p className="mt-3 text-base leading-relaxed text-slate-600 sm:text-lg">{blog.downloadDescription}</p>
        )}
        <a {...linkProps}
          className="mt-5 flex w-full items-center justify-center rounded-full bg-[#f26b1d] px-5 py-3.5 text-center text-base font-bold text-white shadow-sm transition-colors hover:bg-[#d95a12] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f26b1d] sm:inline-flex sm:w-auto sm:px-7 sm:text-lg">
          {button}
        </a>
        {blog.downloadNote && (
          <p className="mt-4 text-sm leading-relaxed text-slate-500">{blog.downloadNote}</p>
        )}
      </div>
    </aside>
  );
}

// Placeholder target for BlogContentRenderer's COMPONENT_MAP.
export function InlineDownloadCard() {
  const blog = useContext(BlogDataContext);
  return blog ? <DownloadBox blog={blog} at="inline" /> : null;
}

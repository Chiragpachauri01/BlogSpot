"use client";

/**
 * BlogCard.jsx
 * Reusable blog preview card used in:
 *  - /blog list page
 *  - Related posts section
 *  - CMS preview thumbnails
 *
 * Props:
 *  blog     – blog document (no full HTML content needed — listing fields only)
 *  variant  – "default" | "compact" | "featured" | "horizontal"
 *  priority – boolean (pass true for LCP image in first card)
 *
 * NOTE: BlogCard never renders blog.content HTML directly.
 * Only blog.excerpt (plain text after stripping tags) is used.
 * This means BlogContentRenderer is NOT needed here.
 */

import Image from "next/image";
import Link  from "next/link";
import { formatDate, autoExcerpt, calcReadingTime } from "./BlogUtils";

export default function BlogCard({ blog, variant = "default", priority = false, basePath = "/blog" }) {
  if (!blog) return null;

  const slug        = blog.slug  || "";
  const title       = blog.title || "Untitled";
  // autoExcerpt strips HTML tags → safe plain text, no XSS risk
  const excerpt     = blog.excerpt || autoExcerpt(blog.content || "");
  const readingTime = blog.readingTime ?? calcReadingTime(blog.content || "");
  const tags        = (blog.tags || []).slice(0, 3);
  const date        = formatDate(blog.createdAt, "short");
  const href        = `${basePath}/${slug}`;

  // ── FEATURED (large, hero-style) ──────────────────────────────────────────
  if (variant === "featured") {
    return (
      <article className="group relative overflow-hidden rounded-2xl bg-white shadow-sm border border-gray-100 hover:shadow-xl transition-all duration-500 hover:-translate-y-1">
        {blog.image && (
          <div className="relative h-72 w-full overflow-hidden">
            <Image
              src={blog.image}
              alt={title}
              fill
              priority={priority}
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            {tags[0] && (
              <span className="absolute top-4 left-4 bg-white/95 text-gray-800 text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wider shadow-sm">
                {tags[0]}
              </span>
            )}
          </div>
        )}
        <div className="p-7">
          <div className="flex items-center gap-3 text-xs text-gray-600 mb-3 font-medium">
            {date && <time dateTime={blog.createdAt}>{date}</time>}
            <span aria-hidden>·</span>
            <span>{readingTime} min read</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 leading-snug mb-3 group-hover:text-blue-600 transition-colors line-clamp-2">
            <Link href={href} className="outline-none focus-visible:underline">{title}</Link>
          </h2>
          <p className="text-gray-500 text-sm leading-relaxed line-clamp-3">{excerpt}</p>
          <Link
            href={href}
            className="inline-flex items-center gap-1.5 mt-5 text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
          >
            Read article<span className="sr-only">: {title}</span> <ArrowIcon />
          </Link>
        </div>
      </article>
    );
  }

  // ── HORIZONTAL (side-by-side, for related posts) ──────────────────────────
  if (variant === "horizontal") {
    return (
      <article className="group flex gap-5 items-start p-4 rounded-xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100">
        {blog.image && (
          <div className="relative w-24 h-20 shrink-0 rounded-lg overflow-hidden">
            <Image
              src={blog.image}
              alt={title}
              fill
              sizes="96px"
              className="object-cover"
            />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs text-gray-600 mb-1 font-medium">
            {date} · {readingTime} min
          </p>
          <h3 className="text-sm font-semibold text-gray-800 line-clamp-2 group-hover:text-blue-600 transition-colors leading-snug">
            <Link href={href} className="outline-none focus-visible:underline">{title}</Link>
          </h3>
        </div>
      </article>
    );
  }

  // ── COMPACT (minimal grid card) ───────────────────────────────────────────
  if (variant === "compact") {
    return (
      <article className="group p-5 rounded-xl border border-gray-100 hover:border-blue-200 hover:shadow-md bg-white transition-all duration-300">
        <div className="flex items-center gap-2 text-xs text-gray-600 mb-2 font-medium">
          {date && <time dateTime={blog.createdAt}>{date}</time>}
          <span aria-hidden>·</span>
          <span>{readingTime} min</span>
        </div>
        <h3 className="font-semibold text-gray-900 text-base leading-snug mb-2 group-hover:text-blue-600 transition-colors line-clamp-2">
          <Link href={href} className="outline-none focus-visible:underline">{title}</Link>
        </h3>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {tags.map((t) => (
              <span key={t} className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded-full border border-gray-200">
                {t}
              </span>
            ))}
          </div>
        )}
      </article>
    );
  }

  // ── DEFAULT ───────────────────────────────────────────────────────────────
  return (
    <article className="group flex flex-col bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 shadow-sm">
      {blog.image ? (
        <div className="relative h-52 w-full overflow-hidden shrink-0">
          <Image
            src={blog.image}
            alt={title}
            fill
            priority={priority}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-700 group-hover:scale-105"
          />
        </div>
      ) : (
        <div className="h-52 w-full bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center shrink-0">
          <span className="text-4xl opacity-30" aria-hidden>✦</span>
        </div>
      )}

      <div className="flex flex-col flex-1 p-6">
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {tags.map((t) => (
              <span key={t} className="text-[11px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
                {t}
              </span>
            ))}
          </div>
        )}

        <h2 className="font-bold text-gray-900 text-lg leading-snug mb-2 group-hover:text-blue-600 transition-colors line-clamp-2 flex-1">
          <Link href={href} className="outline-none focus-visible:underline">{title}</Link>
        </h2>

        <p className="text-sm text-gray-500 leading-relaxed line-clamp-3 mb-4">{excerpt}</p>

        <div className="flex items-center justify-between pt-4 border-t border-gray-50 mt-auto">
          <div className="flex items-center gap-2 text-xs text-gray-600 font-medium">
            {date && <time dateTime={blog.createdAt}>{date}</time>}
            <span aria-hidden>·</span>
            <span>{readingTime} min read</span>
          </div>
          <Link
            href={href}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors"
          >
            Read<span className="sr-only">: {title}</span> <ArrowIcon size={12} />
          </Link>
        </div>
      </div>
    </article>
  );
}

// ── Small arrow icon ──────────────────────────────────────────────────────────
function ArrowIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M1 7h12M8 2l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
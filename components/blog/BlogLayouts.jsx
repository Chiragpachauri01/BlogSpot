"use client";

/**
 * BlogLayouts.jsx — quickcleaningservices.in
 *
 * All blog detail layout variants. Layout controlled from CMS only.
 * Features: TOC (sidebar + inline), ShareBar, BookingCTA, Related Posts
 *
 * Layouts: default | minimal | magazine | docs | cards | hero | timeline
 *
 * ── Fix: renderContent prop removed ──────────────────────────────────────────
 * The previous version tried to pass `renderContent` as a function prop from
 * the Server Component (blog/[slug]/page.jsx) → Client Component (BlogLayouts).
 * Next.js App Router does not allow functions to cross the Server/Client
 * boundary as props.
 *
 * Fix: BlogContentRenderer is imported directly here (both are "use client")
 * and called inside ContentBlock. No prop crossing the boundary.
 * blog/[slug]/page.jsx reverts to: <BlogDetailLayout blog={blog} allPosts={allPosts} />
 */

import Image from "next/image";
import Link  from "next/link";
import {
  generateTOC, getRelatedPosts, formatDate, calcReadingTime,
  splitIntoSections, isMeaningfullyUpdated, safeDownloadUrl,
} from "./BlogUtils";
import BlogCard            from "./BlogCard";
import ShareBar            from "./SharebBar";
import TableOfContents     from "./TableOfContents";
import ContactCTA from "./ContactCTA";
import BlogContentRenderer from "./BlogContentRenderer";

// ─── Root switcher ────────────────────────────────────────────────────────────
export function BlogDetailLayout({ blog, allPosts = [] }) {
  if (!blog) return null;
  const props = { blog, allPosts };
  switch (blog.layout) {
    case "minimal":  return <MinimalLayout  {...props} />;
    case "magazine": return <MagazineLayout {...props} />;
    case "docs":     return <DocsLayout     {...props} />;
    case "cards":    return <CardsLayout    {...props} />;
    case "hero":     return <HeroLayout     {...props} />;
    case "timeline": return <TimelineLayout {...props} />;
    default:         return <DefaultLayout  {...props} />;
  }
}

// ─── ContentBlock ─────────────────────────────────────────────────────────────
/**
 * Renders blog HTML through BlogContentRenderer.
 * BlogContentRenderer tokenizes the HTML and safely injects whitelisted
 * React components where data-component="…" placeholders appear.
 * All other HTML is rendered via dangerouslySetInnerHTML (sanitized on save).
 *
 * `className` wraps the output so each layout's Tailwind prose classes apply.
 */
function ContentBlock({ html, className = "" }) {
  if (!html) return null;
  if (className) {
    return (
      <div className={className}>
        <BlogContentRenderer html={html} />
      </div>
    );
  }
  return <BlogContentRenderer html={html} />;
}

// ─── Shared primitives ────────────────────────────────────────────────────────
function TagPill({ tag }) {
  return (
    <Link
      href={`/blog?tag=${encodeURIComponent(tag)}`}
      className="inline-flex items-center text-[11px] font-bold uppercase tracking-wider text-teal-600 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-full transition-colors border border-teal-100"
    >
      {tag}
    </Link>
  );
}

// ─── Author / freshness helpers ───────────────────────────────────────────────
// Author fields are optional in the CMS; fall back to the organisation.
function orgName(blog) {
  return blog.orgName || "Shark Web Digital";
}

function authorName(blog) {
  return blog.authorName || orgName(blog);
}

// "Updated <date>" only when the post changed more than a day after publishing.
function updatedDate(blog) {
  return isMeaningfullyUpdated(blog.createdAt, blog.updatedAt)
    ? formatDate(blog.updatedAt, "long")
    : "";
}

function MetaLine({ blog }) {
  const date    = formatDate(blog.createdAt, "long");
  const updated = updatedDate(blog);
  const rt      = blog.readingTime ?? calcReadingTime(blog.content || "");
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 font-medium">
      {date && <time dateTime={blog.createdAt}>{date}</time>}
      {updated && <><span aria-hidden>·</span><span>Updated <time dateTime={blog.updatedAt}>{updated}</time></span></>}
      {date && <span aria-hidden>·</span>}
      <span>
        By <span className="text-gray-800">{authorName(blog)}</span>
        {blog.authorName && blog.authorRole && <>, {blog.authorRole}</>}
      </span>
      <span aria-hidden>·</span>
      <span>{rt} min read</span>
    </div>
  );
}

// Optional CMS download (e.g. a printable checklist PDF), shown above the article.
function DownloadBox({ blog }) {
  const url = safeDownloadUrl(blog.downloadUrl);
  if (!url) return null;
  const isPdf = /\.pdf(?:$|[?#])/i.test(url);
  const label = blog.downloadLabel || (isPdf ? "Download the printable version (PDF)" : "Download");
  return (
    <aside aria-label="Download" className="my-8 flex flex-col gap-4 rounded-2xl border border-teal-100 bg-teal-50 p-5 sm:flex-row sm:items-center sm:p-6">
      <div className="min-w-0 flex-1">
        <p className="font-bold text-gray-900">{label}</p>
        <p className="mt-1 text-sm text-gray-600">Free to download{isPdf ? " and print" : ""}.</p>
      </div>
      <a href={url} target="_blank" rel="noopener" {...(isPdf && { download: "" })}
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-700">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M8 2v8m0 0L4.5 6.5M8 10l3.5-3.5M2.5 13.5h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Download{isPdf ? " PDF" : ""}
      </a>
    </aside>
  );
}

function AuthorBox({ blog }) {
  const hasAuthor = Boolean(blog.authorName);
  const name      = authorName(blog);
  const role      = hasAuthor ? blog.authorRole : "";
  const bio       = hasAuthor ? blog.authorBio : "";
  const initials  = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <aside aria-label="About the author" className="mb-8 flex gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-5 sm:p-6">
      <div aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal-600 text-sm font-black text-white">
        {initials}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Written by</p>
        <p className="mt-1 font-bold text-gray-900">
          {name}
          {role && <span className="font-medium text-gray-600"> · {role}</span>}
        </p>
        {bio && <p className="mt-2 text-sm leading-relaxed text-gray-600">{bio}</p>}
      </div>
    </aside>
  );
}

function Breadcrumb({ title }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs text-gray-600 font-medium">
        <li><Link href="/"     className="hover:text-gray-700 transition-colors">Home</Link></li>
        <li aria-hidden>/</li>
        <li><Link href="/blog" className="hover:text-gray-700 transition-colors">Blog</Link></li>
        <li aria-hidden>/</li>
        <li className="text-gray-600 truncate max-w-[160px] sm:max-w-xs" aria-current="page">{title}</li>
      </ol>
    </nav>
  );
}

function BlogFooter({ blog, url }) {
  const tags = blog.tags || [];
  return (
    <footer className="mt-12 pt-8 border-t border-gray-100">
      <AuthorBox blog={blog} />
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-widest self-center mr-1">Tags</span>
          {tags.map((t) => <TagPill key={t} tag={t} />)}
        </div>
      )}
      <ShareBar url={url} title={blog.title} />
    </footer>
  );
}

function RelatedPosts({ blog, allPosts }) {
  const related = getRelatedPosts(blog, allPosts, 3);
  if (!related.length) return null;
  return (
    <aside aria-label="Related articles" className="mt-16 pt-10 border-t border-gray-100">
      <h2 className="text-lg font-bold text-gray-900 mb-6">Related Articles</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {related.map((p) => <BlogCard key={p.id} blog={p} variant="compact" />)}
      </div>
    </aside>
  );
}

function useTOC(blog) {
  if (!blog.showTOC) return [];
  return generateTOC(blog.content || "");
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. DEFAULT
// ══════════════════════════════════════════════════════════════════════════════
function DefaultLayout({ blog, allPosts }) {
  const canonical  = blog.seo?.canonicalUrl || `/blog/${blog.slug}`;
  const toc        = useTOC(blog);
  const hasSidebar = blog.showTOC && blog.tocPosition === "sidebar" && toc.length > 0;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 pb-2">
        <Breadcrumb title={blog.title} />
      </div>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 pb-8">
        {(blog.tags || []).length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {blog.tags.slice(0, 3).map((t) => <TagPill key={t} tag={t} />)}
          </div>
        )}
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-gray-950 leading-[1.1] tracking-tight mb-4">
          {blog.title}
        </h1>
        {blog.excerpt && (
          <p className="text-base sm:text-lg text-gray-500 leading-relaxed mb-5 max-w-2xl">{blog.excerpt}</p>
        )}
        <MetaLine blog={blog} />
      </section>

      {blog.image && (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 mb-10">
          <div className="relative rounded-2xl overflow-hidden shadow-xl aspect-[16/9] bg-gray-50">
            <Image src={blog.image} alt={blog.title} fill priority
              sizes="(max-width: 896px) 100vw, 896px" className="object-contain" />
          </div>
        </div>
      )}

      {blog.showTOC && blog.tocPosition === "inline" && toc.length > 0 && (
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <TableOfContents toc={toc} position="inline" />
        </div>
      )}

      <div className={`${hasSidebar ? "max-w-6xl flex gap-10 items-start" : "max-w-3xl"} mx-auto px-4 sm:px-6 pb-8`}>
        {hasSidebar && <TableOfContents toc={toc} position="sidebar" />}
        <div className={hasSidebar ? "flex-1 min-w-0" : undefined}>
          <DownloadBox blog={blog} />
          <section aria-label="Article content">
            <ContentBlock html={blog.content || ""} />
          </section>
          <ContactCTA />
          <BlogFooter blog={blog} url={canonical} />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-20">
        <RelatedPosts blog={blog} allPosts={allPosts} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. MINIMAL
// ══════════════════════════════════════════════════════════════════════════════
function MinimalLayout({ blog, allPosts }) {
  const canonical = blog.seo?.canonicalUrl || `/blog/${blog.slug}`;
  const toc       = useTOC(blog);

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-0">
        <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-700 transition-colors font-medium">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          All posts
        </Link>
      </div>
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-8 border-b border-stone-200">
        <MetaLine blog={blog} />
        <h1 className="mt-3 text-3xl sm:text-4xl font-bold text-stone-900 leading-[1.15] tracking-tight">{blog.title}</h1>
        {blog.excerpt && <p className="mt-4 text-stone-500 text-base leading-relaxed italic">{blog.excerpt}</p>}
      </section>
      {blog.image && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8">
          <div className="relative rounded-xl overflow-hidden aspect-[16/9] bg-stone-50">
            <Image src={blog.image} alt={blog.title} fill priority sizes="680px" className="object-contain" />
          </div>
        </div>
      )}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        {blog.showTOC && toc.length > 0 && (
          <TableOfContents toc={toc} position={blog.tocPosition || "inline"} className="mb-8" />
        )}
        <DownloadBox blog={blog} />
        <section aria-label="Article content">
          <ContentBlock html={blog.content || ""} />
        </section>
        <ContactCTA />
        <BlogFooter blog={blog} url={canonical} />
      </div>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-20">
        <RelatedPosts blog={blog} allPosts={allPosts} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. MAGAZINE
// ══════════════════════════════════════════════════════════════════════════════
function MagazineLayout({ blog, allPosts }) {
  const canonical = blog.seo?.canonicalUrl || `/blog/${blog.slug}`;
  const toc       = useTOC(blog);
  const date      = formatDate(blog.createdAt, "long");
  const updated   = updatedDate(blog);
  const rt        = blog.readingTime ?? calcReadingTime(blog.content || "");

  return (
    <div className="min-h-screen bg-white">
      <section className="relative bg-gray-950 overflow-hidden min-h-[55vh] sm:min-h-[65vh] flex items-end">
        {blog.image ? (
          <>
            <Image src={blog.image} alt={blog.title} fill priority sizes="100vw" className="object-cover opacity-50" />
            <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/60 to-transparent" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-teal-900 via-gray-900 to-gray-950" />
        )}
        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-8 md:px-12 pb-12 pt-20 w-full">
          {(blog.tags || []).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {blog.tags.slice(0, 2).map((t) => (
                <Link key={t} href={`/blog?tag=${encodeURIComponent(t)}`}
                  className="text-xs font-black uppercase tracking-[0.15em] text-white bg-white/15 hover:bg-white/25 backdrop-blur px-3 py-1.5 rounded-sm transition-colors border border-white/20">
                  {t}
                </Link>
              ))}
            </div>
          )}
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-white leading-[1.05] tracking-tight max-w-4xl mb-5">{blog.title}</h1>
          {blog.excerpt && <p className="text-base sm:text-lg text-gray-300 max-w-2xl leading-relaxed mb-6">{blog.excerpt}</p>}
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-300 font-medium">
            {date && <time dateTime={blog.createdAt}>{date}</time>}
            {updated && <><span aria-hidden>·</span><span>Updated <time dateTime={blog.updatedAt}>{updated}</time></span></>}
            <span aria-hidden>·</span>
            <span>By {authorName(blog)}</span>
            <span aria-hidden>·</span>
            <span>{rt} min read</span>
          </div>
        </div>
      </section>
      <div className="border-b border-gray-100 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 md:px-12 py-3">
          <Breadcrumb title={blog.title} />
        </div>
      </div>
      <div className="max-w-5xl mx-auto px-4 sm:px-8 md:px-12 py-12">
        {blog.showTOC && toc.length > 0 && (
          <TableOfContents toc={toc} position={blog.tocPosition || "inline"} className="mb-8" />
        )}
        <DownloadBox blog={blog} />
        <section aria-label="Article content">
          <ContentBlock html={blog.content || ""} />
        </section>
        <ContactCTA />
        <BlogFooter blog={blog} url={canonical} />
      </div>
      <div className="max-w-5xl mx-auto px-4 sm:px-8 md:px-12 pb-20">
        <RelatedPosts blog={blog} allPosts={allPosts} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. DOCS
// ══════════════════════════════════════════════════════════════════════════════
function DocsLayout({ blog, allPosts }) {
  const canonical = blog.seo?.canonicalUrl || `/blog/${blog.slug}`;
  const toc       = generateTOC(blog.content || "");

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-gray-100 bg-white/90 sticky top-0 z-30 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
          <Breadcrumb title={blog.title} />
          <div className="ml-auto text-xs text-gray-600 font-medium shrink-0">
            {blog.readingTime ?? calcReadingTime(blog.content || "")} min read
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex gap-10 py-10">
        {toc.length > 0 && (
          <TableOfContents toc={toc} position="sidebar" className="hidden lg:block" />
        )}
        <div className="flex-1 min-w-0">
          {blog.showTOC && toc.length > 0 && (
            <TableOfContents
              toc={toc}
              position={blog.tocPosition === "inline" ? "inline" : "sidebar"}
              className="block lg:hidden mb-8"
            />
          )}
          <section className="mb-8 pb-6 border-b border-gray-100">
            <div className="flex flex-wrap gap-2 mb-4">
              {(blog.tags || []).map((t) => <TagPill key={t} tag={t} />)}
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-gray-950 tracking-tight leading-snug mb-3">{blog.title}</h1>
            {blog.excerpt && <p className="text-gray-500 text-base leading-relaxed">{blog.excerpt}</p>}
            <MetaLine blog={blog} />
          </section>
          {blog.image && (
            <div className="relative rounded-xl overflow-hidden mb-10 shadow-md aspect-[16/9] bg-gray-50">
              <Image src={blog.image} alt={blog.title} fill priority
                sizes="(max-width: 1280px) 100vw, 900px" className="object-contain" />
            </div>
          )}
          <DownloadBox blog={blog} />
          <section aria-label="Article content">
            <ContentBlock html={blog.content || ""} />
          </section>
          <ContactCTA />
          <BlogFooter blog={blog} url={canonical} />
          <RelatedPosts blog={blog} allPosts={allPosts} />
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. CARDS
// ══════════════════════════════════════════════════════════════════════════════
function CardsLayout({ blog, allPosts }) {
  const canonical     = blog.seo?.canonicalUrl || `/blog/${blog.slug}`;
  const toc           = useTOC(blog);
  const sections      = splitIntoSections(blog.content || "");
  const sectionColors = [
    "border-t-teal-500","border-t-emerald-500","border-t-cyan-500",
    "border-t-green-500","border-t-teal-400","border-t-blue-500",
  ];
  const sectionProseClasses = "px-6 sm:px-8 pb-8 pt-3";

  return (
    <div className="min-h-screen bg-gray-50">
      <section className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
          <Breadcrumb title={blog.title} />
          <div className="flex flex-wrap gap-2 mt-5 mb-4">
            {(blog.tags || []).map((t) => <TagPill key={t} tag={t} />)}
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-gray-950 tracking-tight leading-tight mb-4">{blog.title}</h1>
          {blog.excerpt && <p className="text-gray-500 text-base sm:text-lg leading-relaxed mb-5">{blog.excerpt}</p>}
          <MetaLine blog={blog} />
        </div>
      </section>
      {blog.image && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 mt-8">
          <div className="relative rounded-2xl overflow-hidden shadow-lg aspect-[16/9] bg-gray-50">
            <Image src={blog.image} alt={blog.title} fill priority
              sizes="(max-width: 1024px) 100vw, 1024px" className="object-contain" />
          </div>
        </div>
      )}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        {blog.showTOC && toc.length > 0 && (
          <TableOfContents toc={toc} position={blog.tocPosition || "inline"} className="mb-6" />
        )}
        <DownloadBox blog={blog} />
        <div className="space-y-5">
          {sections.map((section, i) => (
            <article key={i} id={section.id || undefined}
              className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden border-t-4 ${sectionColors[i % sectionColors.length]}`}>
              {section.heading && (
                <div className="px-6 sm:px-8 pt-7 pb-3">
                  <h2 className="text-lg sm:text-xl font-black text-gray-900 tracking-tight">{section.heading}</h2>
                </div>
              )}
              <ContentBlock html={section.html} className={sectionProseClasses} />
            </article>
          ))}
        </div>
        <ContactCTA />
        <div className="bg-white rounded-2xl p-6 sm:p-8 mt-6 border border-gray-100 shadow-sm">
          <BlogFooter blog={blog} url={canonical} />
        </div>
      </div>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-20">
        <RelatedPosts blog={blog} allPosts={allPosts} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. HERO
// ══════════════════════════════════════════════════════════════════════════════
function HeroLayout({ blog, allPosts }) {
  const canonical = blog.seo?.canonicalUrl || `/blog/${blog.slug}`;
  const toc       = useTOC(blog);

  return (
    <div className="min-h-screen bg-white">
      <section className="relative h-[70vh] sm:h-[80vh] max-h-[90vh] flex flex-col justify-end overflow-hidden bg-gray-950">
        {blog.image ? (
          <>
            <Image src={blog.image} alt={blog.title} fill priority sizes="100vw" className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/10" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-teal-900 via-slate-900 to-gray-950">
            <div className="absolute inset-0 opacity-10"
              style={{ backgroundImage:"radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize:"40px 40px" }} />
          </div>
        )}
        <div className="absolute top-6 left-4 sm:left-8 z-20">
          <Link href="/blog"
            className="inline-flex items-center gap-2 text-white/80 hover:text-white text-sm font-medium bg-white/10 backdrop-blur hover:bg-white/20 px-4 py-2 rounded-full transition-all border border-white/20">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Blog
          </Link>
        </div>
        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-8 pb-14 sm:pb-20 w-full">
          {(blog.tags || []).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {blog.tags.slice(0, 2).map((t) => (
                <span key={t} className="text-[11px] font-black uppercase tracking-[0.2em] text-white/90 bg-white/10 backdrop-blur border border-white/20 px-3 py-1.5 rounded-sm">{t}</span>
              ))}
            </div>
          )}
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-black text-white leading-[1.0] tracking-tight mb-5 max-w-4xl">{blog.title}</h1>
          {blog.excerpt && <p className="text-base sm:text-xl text-white/70 max-w-2xl leading-relaxed mb-7">{blog.excerpt}</p>}
          <p className="text-base sm:text-xl text-white/50 mb-7">
            By {authorName(blog)}{blog.authorName && blog.authorRole && <>, {blog.authorRole}</>}
          </p>
          <div className="flex flex-wrap items-center gap-4 text-sm text-white/50 font-medium">
            <time dateTime={blog.createdAt}>{formatDate(blog.createdAt, "long")}</time>
            {updatedDate(blog) && <><span aria-hidden>·</span><span>Updated <time dateTime={blog.updatedAt}>{updatedDate(blog)}</time></span></>}
            <span aria-hidden>·</span>
            <span>{blog.readingTime ?? calcReadingTime(blog.content || "")} min read</span>
          </div>
        </div>
      </section>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
        {blog.showTOC && toc.length > 0 && (
          <TableOfContents toc={toc} position={blog.tocPosition || "inline"} className="mb-10" />
        )}
        <DownloadBox blog={blog} />
        <section aria-label="Article content">
          <ContentBlock html={blog.content || ""} />
        </section>
        <ContactCTA />
        <BlogFooter blog={blog} url={canonical} />
      </div>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-20">
        <RelatedPosts blog={blog} allPosts={allPosts} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 7. TIMELINE
// ══════════════════════════════════════════════════════════════════════════════
function TimelineLayout({ blog, allPosts }) {
  const canonical = blog.seo?.canonicalUrl || `/blog/${blog.slug}`;
  const toc       = useTOC(blog);
  const sections  = splitIntoSections(blog.content || "");
  const stepsOnly = sections.filter((s) => s.heading);
  const intro     = sections.find((s) => !s.heading);

  const stepProseClasses = "";

  return (
    <div className="min-h-screen bg-white">
      <section className="border-b border-gray-100 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 pb-10">
          <Breadcrumb title={blog.title} />
          <div className="flex flex-wrap gap-2 mt-5 mb-4">
            {(blog.tags || []).map((t) => <TagPill key={t} tag={t} />)}
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-gray-950 tracking-tight leading-tight mb-4">{blog.title}</h1>
          {blog.excerpt && <p className="text-gray-500 text-base leading-relaxed mb-5">{blog.excerpt}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <MetaLine blog={blog} />
            {stepsOnly.length > 0 && <><span aria-hidden>·</span><span className="text-sm text-gray-600">{stepsOnly.length} steps</span></>}
          </div>
        </div>
      </section>
      {blog.image && (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 mt-8">
          <div className="relative rounded-xl overflow-hidden shadow-md aspect-[16/9] bg-gray-50">
            <Image src={blog.image} alt={blog.title} fill priority
              sizes="(max-width: 768px) 100vw, 768px" className="object-contain" />
          </div>
        </div>
      )}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
        {blog.showTOC && toc.length > 0 && (
          <TableOfContents toc={toc} position={blog.tocPosition || "inline"} className="mb-8" />
        )}
        <DownloadBox blog={blog} />
        {intro?.html && (
          <ContentBlock html={intro.html} className="mb-12" />
        )}
        {stepsOnly.length > 0 && (
          <ol aria-label="Steps" className="relative">
            <div className="absolute left-5 sm:left-6 top-0 bottom-0 w-0.5 bg-gray-100" aria-hidden />
            {stepsOnly.map((step, i) => (
              <li key={i} id={step.id || undefined} className="relative flex gap-5 sm:gap-8 mb-10 last:mb-0">
                <div className="relative z-10 flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs sm:text-sm font-black shadow-lg shadow-teal-100">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="flex-1 pb-2 pt-1.5 sm:pt-2.5 min-w-0">
                  <h2 className="text-lg sm:text-xl font-black text-gray-900 tracking-tight mb-3 leading-snug">{step.heading}</h2>
                  <ContentBlock html={step.html} className={stepProseClasses} />
                </div>
              </li>
            ))}
          </ol>
        )}
        <ContactCTA />
        <BlogFooter blog={blog} url={canonical} />
      </div>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-20">
        <RelatedPosts blog={blog} allPosts={allPosts} />
      </div>
    </div>
  );
}
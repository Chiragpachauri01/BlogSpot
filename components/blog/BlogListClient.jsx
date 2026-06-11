"use client";

/**
 * BlogListClient.jsx
 *
 * Client component for the /blog listing page — quickcleaningservices.in
 * Handles: search, tag filtering, load-more pagination.
 * Mobile-first. Renders a featured card + 3-col grid.
 *
 * NOTE: This component never renders blog.content HTML directly.
 * All content rendering happens inside BlogCard (excerpt only)
 * and BlogDetailLayout (full content via BlogContentRenderer).
 * No changes to content rendering are needed here.
 */

import { useState, useMemo, useCallback } from "react";
import BlogCard from "./BlogCard";

const PAGE_SIZE = 9;

export default function BlogListClient({ initialBlogs = [], allTags = [], basePath = "/blog" }) {
  const [search,    setSearch]    = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [page,      setPage]      = useState(1);

  // ── Filter logic ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = initialBlogs;

    if (activeTag) {
      list = list.filter((b) =>
        (b.tags || []).some((t) => t.toLowerCase() === activeTag.toLowerCase())
      );
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (b) =>
          (b.title   || "").toLowerCase().includes(q) ||
          (b.excerpt || "").toLowerCase().includes(q) ||
          (b.tags    || []).some((t) => t.toLowerCase().includes(q))
      );
    }

    return list;
  }, [initialBlogs, activeTag, search]);

  const paginated = useMemo(() => filtered.slice(0, page * PAGE_SIZE), [filtered, page]);
  const hasMore   = paginated.length < filtered.length;

  const handleTagClick = useCallback((tag) => {
    setActiveTag((prev) => (prev === tag ? "" : tag));
    setPage(1);
  }, []);

  const handleSearchChange = useCallback((e) => {
    setSearch(e.target.value);
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setSearch("");
    setActiveTag("");
    setPage(1);
  }, []);

  const featuredPost = paginated[0];
  const gridPosts    = paginated.slice(1);
  const isFiltered   = !!search.trim() || !!activeTag;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">

      {/* ── Search + result count ── */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1 max-w-md">
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none"
            width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden
          >
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="2"/>
            <path d="M13.5 13.5L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <input
            type="search"
            value={search}
            onChange={handleSearchChange}
            placeholder="Search articles…"
            aria-label="Search blog posts"
            autoComplete="off"
            className="
              w-full pl-11 pr-4 py-3
              bg-white border border-gray-200 rounded-xl
              text-sm text-gray-800 placeholder-gray-400
              outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-400
              transition-all shadow-sm
            "
          />
        </div>

        <p className="text-sm text-gray-600 font-medium shrink-0">
          {filtered.length} {filtered.length === 1 ? "post" : "posts"}
          {activeTag && (
            <> in <strong className="text-gray-700">#{activeTag}</strong></>
          )}
        </p>
      </div>

      {/* ── Tag filter pills ── */}
      {allTags.length > 0 && (
        <nav aria-label="Filter by tag">
          <ul className="flex flex-wrap gap-2">
            <li>
              <button
                onClick={() => { setActiveTag(""); setPage(1); }}
                aria-pressed={activeTag === ""}
                className={`
                  text-xs font-bold uppercase tracking-wider
                  px-3.5 py-1.5 rounded-full border transition-all
                  ${activeTag === ""
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:text-gray-800"
                  }
                `}
              >
                All
              </button>
            </li>
            {allTags.map((tag) => (
              <li key={tag}>
                <button
                  onClick={() => handleTagClick(tag)}
                  aria-pressed={activeTag === tag}
                  className={`
                    text-xs font-bold uppercase tracking-wider
                    px-3.5 py-1.5 rounded-full border transition-all
                    ${activeTag === tag
                      ? "bg-teal-600 text-white border-teal-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-teal-300 hover:text-teal-700"
                    }
                  `}
                >
                  {tag}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* ── Empty state ── */}
      {filtered.length === 0 && (
        <div className="text-center py-20 sm:py-28">
          <p className="text-5xl mb-4" aria-hidden>🔍</p>
          <p className="text-gray-700 font-semibold text-lg">No posts found</p>
          <p className="text-gray-600 text-sm mt-1">
            Try adjusting your search or removing the tag filter.
          </p>
          {isFiltered && (
            <button
              onClick={clearFilters}
              className="mt-5 text-sm text-teal-600 hover:underline font-medium"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* ── Featured post (full-width) ── */}
      {featuredPost && (
        <div>
          <BlogCard blog={featuredPost} variant="featured" priority basePath={basePath} />
        </div>
      )}

      {/* ── Grid ── */}
      {gridPosts.length > 0 && (
        <section aria-label="More articles">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {gridPosts.map((blog, i) => (
              <BlogCard key={blog.id} blog={blog} variant="default" priority={i < 3} basePath={basePath} />
            ))}
          </div>
        </section>
      )}

      {/* ── Load more ── */}
      {hasMore && (
        <div className="text-center pt-2">
          <button
            onClick={() => setPage((p) => p + 1)}
            className="
              inline-flex items-center gap-2
              bg-white border border-gray-200 hover:border-teal-300
              hover:text-teal-700 text-gray-700
              font-semibold text-sm px-8 py-3.5 rounded-xl
              shadow-sm hover:shadow transition-all
            "
          >
            Load more articles
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M7 1v12M1 7l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <p className="text-xs text-gray-600 mt-2">
            Showing {paginated.length} of {filtered.length}
          </p>
        </div>
      )}

    </div>
  );
}
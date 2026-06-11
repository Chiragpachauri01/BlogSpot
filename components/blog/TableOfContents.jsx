"use client";

import { useEffect, useState, useRef } from "react";

export default function TableOfContents({ toc = [], position = "sidebar" }) {
  const [activeId, setActiveId] = useState("");
  const [open, setOpen] = useState(false);
  const tocRef = useRef(null);

  // ─────────────────────────────────────────────
  // 🔥 Intersection Observer (active section)
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!toc.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible.length > 0) {
          const id = visible[0].target.id;
          setActiveId(id);

          // ✅ Sync URL
          window.history.replaceState(null, "", `#${id}`);
        }
      },
      { rootMargin: "-96px 0px -60% 0px" }
    );

    toc.forEach((item) => {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [toc]);

  // ─────────────────────────────────────────────
  // 🔥 Auto-scroll TOC
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!activeId || !tocRef.current) return;

    const activeEl = tocRef.current.querySelector(
      `[data-id="${activeId}"]`
    );

    if (!activeEl) return;

    const container = tocRef.current;

    const elTop = activeEl.offsetTop;
    const elBottom = elTop + activeEl.offsetHeight;

    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;

    if (elTop < viewTop || elBottom > viewBottom) {
      activeEl.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeId]);

  // ─────────────────────────────────────────────
  // 🔗 Click scroll
  // ─────────────────────────────────────────────
  const handleClick = (id) => {
    const el = document.getElementById(id);
    if (!el) return;

    const navbarHeight = 96;
    const top = el.getBoundingClientRect().top + window.scrollY - navbarHeight;
    window.scrollTo({ top, behavior: "smooth" });

    window.history.replaceState(null, "", `#${id}`);
    setOpen(false);
  };

  if (!toc.length) return null;

  // ─────────────────────────────────────────────
  // 🧠 Level spacing helper
  // ─────────────────────────────────────────────
  const getPadding = (level) => {
    if (level === 1) return "pl-2";
    if (level === 2) return "pl-5";
    if (level === 3) return "pl-8";
    return "pl-2";
  };

  // ─────────────────────────────────────────────
  // 🔹 INLINE TOC
  // ─────────────────────────────────────────────
  if (position === "inline") {
    return (
      <nav className="mb-10 rounded-2xl border bg-teal-50/60 p-5">
        <p className="text-xs font-bold uppercase text-teal-600 mb-3">
          Contents
        </p>

        <ol className="space-y-2">
          {toc.map((item, index) => (
            <li key={`${item.id}-${index}`}>
              <button
                onClick={() => handleClick(item.id)}
                className={`text-sm text-left w-full ${
                  activeId === item.id
                    ? "text-teal-600 font-semibold"
                    : "text-gray-600 hover:text-teal-700"
                }`}
              >
                {item.text}
              </button>
            </li>
          ))}
        </ol>
      </nav>
    );
  }

  // ─────────────────────────────────────────────
  // 🚀 SIDEBAR (Mobile + Desktop)
  // ─────────────────────────────────────────────
  return (
    <>
      {/* 📱 Floating button */}
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden fixed bottom-4 right-4 z-50 bg-teal-600 text-white px-4 py-2 rounded-full shadow-lg"
      >
        Contents
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-50"
          onClick={() => setOpen(false)}
        />
      )}

      {/* 📱 Bottom Sheet */}
      <div
        className={`lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-xl transform transition-transform ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex justify-center py-2">
          <div className="w-10 h-1.5 bg-gray-300 rounded-full" />
        </div>

        <div className="p-4 border-b font-semibold">Contents</div>

        <div className="max-h-[60vh] overflow-y-auto p-4">
          <ol className="space-y-2">
            {toc.map((item, index) => (
              <li key={`${item.id}-${index}`}>
                <button
                  onClick={() => handleClick(item.id)}
                  className={`text-sm text-left w-full ${
                    activeId === item.id
                      ? "text-teal-600 font-semibold"
                      : "text-gray-600"
                  }`}
                >
                  {item.text}
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* 💻 Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0">
        <div
          ref={tocRef}
          className="sticky top-24 max-h-[calc(100vh-120px)] overflow-y-auto pr-2"
        >
          <p className="text-xs font-bold uppercase text-gray-600 mb-3">
            Contents
          </p>

          <ol className="space-y-1">
            {toc.map((item, index) => (
              <li
                key={`${item.id}-${index}`}
                data-id={item.id}
                className={getPadding(item.level)}
              >
                <button
                  onClick={() => handleClick(item.id)}
                  className={`relative w-full text-left text-sm py-1.5 pr-2 rounded-md transition ${
                    activeId === item.id
                      ? "text-teal-600 font-semibold bg-teal-50"
                      : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  {/* 🔥 Indicator line */}
                  <span
                    className={`absolute left-0 top-1.5 h-4 w-[2px] bg-teal-500 transition ${
                      activeId === item.id ? "opacity-100" : "opacity-0"
                    }`}
                  />

                  {item.text}
                </button>
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </>
  );
}
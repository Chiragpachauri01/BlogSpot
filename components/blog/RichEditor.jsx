"use client";

/**
 * RichEditor.jsx
 *
 * Lightweight, CKEditor-free rich text editor for the Blog CMS.
 *
 * 
 * Features:
 *  - Controlled contenteditable (no raw textarea)
 *  - Toolbar: headings, bold/italic/underline/strike, alignment, lists, links, images
 *  - Component injection: whitelisted <div data-component="..."> placeholders
 *  - HTML sanitizer: strips scripts/events, allows only safe tags + attributes
 *  - Inline style preservation from DOCX → HTML (fonts, colors, alignment)
 *  - Responsive images: max-width:100%, height:auto enforced on insert
 *  - Paste sanitization: strips unsafe HTML on paste
 *
 * Usage:
 *   <RichEditor
 *     key={editorKey}           // change key to force reset (blog switch / docx import)
 *     value={form.content}
 *     onChange={(html) => set("content", html)}
 *     onImageUpload={handleInlineImageUpload}  // async (File) => string (URL)
 *   />
 */

import { useRef, useEffect, useCallback, useState } from "react";

// ─── Sanitizer ──────────────────────────────────────────────────────────────
// Allows only the tags and attributes that a blog post legitimately needs.
// Strips <script>, event handlers (onclick, onerror…), and javascript: URLs.

const SAFE_TAGS = new Set([
    "p", "div", "span", "br",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "strong", "b", "em", "i", "u", "s", "strike",
    "ul", "ol", "li",
    "a", "img",
    "figure", "figcaption",
    "table", "thead", "tbody", "tr", "td", "th",
    "blockquote", "pre", "code",
    "sup", "sub",
]);

const SAFE_ATTRS = new Set([
    "href", "src", "alt", "title", "style", "class",
    "data-component", "loading", "rel", "target",
    "width", "height", "colspan", "rowspan",
    "contenteditable", "id",
]);

function _cleanNode(node) {
    if (node.nodeType === 3 /* TEXT_NODE */) return;
    if (node.nodeType !== 1 /* ELEMENT_NODE */) {
        node.parentNode?.removeChild(node);
        return;
    }

    const tag = node.tagName.toLowerCase();

    if (!SAFE_TAGS.has(tag)) {
        // Unwrap: lift children up, then remove the unsafe wrapper
        const parent = node.parentNode;
        const children = [...node.childNodes];
        children.forEach((c) => parent.insertBefore(c, node));
        parent.removeChild(node);
        children.forEach(_cleanNode);
        return;
    }

    // Strip unsafe attributes
    [...node.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (!SAFE_ATTRS.has(name)) {
            node.removeAttribute(attr.name);
        } else if (["href", "src"].includes(name)) {
            // Block javascript: and data: URLs (except data:image)
            const v = attr.value.trim().toLowerCase();
            if (v.startsWith("javascript:") || (v.startsWith("data:") && !v.startsWith("data:image"))) {
                node.removeAttribute(attr.name);
            }
        }
    });

    [...node.childNodes].forEach(_cleanNode);
}

export function sanitizeHtml(html) {
    if (typeof window === "undefined") return html;
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    [...wrap.childNodes].forEach(_cleanNode);
    return wrap.innerHTML;
}

// ─── Whitelisted injectable components ──────────────────────────────────────
// Add your own components here. Only names in this array can be injected.
export const INJECTABLE_COMPONENTS = [
    { name: "BookingForm", icon: "📅", label: "Booking Form" },
    { name: "ServiceCards", icon: "🃏", label: "Service Cards" },
];

// ─── Toolbar primitives ──────────────────────────────────────────────────────
function Divider() {
    return (
        <span
            aria-hidden
            className="inline-block w-px h-5 bg-gray-200 mx-1 self-center shrink-0"
        />
    );
}

function Btn({ onMouseDown, active, title, disabled, children }) {
    return (
        <button
            type="button"
            title={title}
            disabled={disabled}
            onMouseDown={(e) => {
                e.preventDefault(); // keep focus in editor
                if (!disabled) onMouseDown?.();
            }}
            className={[
                "px-2 py-1.5 rounded text-sm leading-none transition-colors select-none whitespace-nowrap",
                active
                    ? "bg-teal-100 text-teal-600 font-semibold"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
            ].join(" ")}
        >
            {children}
        </button>
    );
}

// ─── Main RichEditor component ───────────────────────────────────────────────
export default function RichEditor({ value = "", onChange, onImageUpload }) {
    const editorRef = useRef(null);

    // Link dialog state
    const [showLink, setShowLink] = useState(false);
    const [linkHref, setLinkHref] = useState("");
    const [linkLabel, setLinkLabel] = useState("");
    const [savedRange, setSavedRange] = useState(null);
    const [altModal, setAltModal] = useState(null);
    // Component dropdown
    const [showComps, setShowComps] = useState(false);

    // Toolbar active states (updated on selection change)
    const [cmd, setCmd] = useState({});
    const [blockFmt, setBlockFmt] = useState("p");

    // ── On mount: hydrate editor with initial HTML ──────────────────────────
    // We rely on the parent passing a new `key` prop when the content source
    // changes (different blog, fresh docx import), which remounts this component.
    useEffect(() => {
        if (editorRef.current) {
            editorRef.current.innerHTML = value;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Push sanitized HTML to parent ─────────────────────────────────────
    const push = useCallback(() => {
        if (!editorRef.current) return;
        onChange(sanitizeHtml(editorRef.current.innerHTML));
    }, [onChange]);

    // ── execCommand shortcut (keeps focus in editor) ───────────────────────
    const exec = useCallback(
        (cmd, val = null) => {
            editorRef.current?.focus();
            document.execCommand(cmd, false, val);
            push();
        },
        [push]
    );
    // ── Click inside editor: detect image clicks → open alt modal ─────────
    const handleEditorClick = useCallback((e) => {
        const img = e.target.closest("img");
        if (!img) return;
        e.preventDefault();
        setAltModal({ node: img, alt: img.getAttribute("alt") || "" });
    }, []);

    const doSaveAlt = useCallback(() => {
        if (!altModal) return;
        altModal.node.setAttribute("alt", altModal.alt);
        setAltModal(null);
        push();
    }, [altModal, push]);
    // ── Refresh toolbar active states after selection change ───────────────
    const refreshToolbar = useCallback(() => {
        try {
            setCmd({
                bold: document.queryCommandState("bold"),
                italic: document.queryCommandState("italic"),
                underline: document.queryCommandState("underline"),
                strike: document.queryCommandState("strikeThrough"),
                ul: document.queryCommandState("insertUnorderedList"),
                ol: document.queryCommandState("insertOrderedList"),
                alignLeft: document.queryCommandState("justifyLeft"),
                alignCenter: document.queryCommandState("justifyCenter"),
                alignRight: document.queryCommandState("justifyRight"),
                alignJustify: document.queryCommandState("justifyFull"),
            });
            const fmt = document.queryCommandValue("formatBlock")?.toLowerCase() || "p";
            setBlockFmt(fmt === "" ? "p" : fmt);
        } catch {
            // queryCommand* can throw in some edge cases — safe to ignore
        }
    }, []);

    // ── Save selection before opening link dialog ──────────────────────────
    const saveSelection = useCallback(() => {
        const sel = window.getSelection?.();
        if (sel?.rangeCount) {
            setSavedRange(sel.getRangeAt(0).cloneRange());
            setLinkLabel(sel.toString());
        }
    }, []);

    const restoreSelection = useCallback((range) => {
        if (!range) return;
        const sel = window.getSelection?.();
        sel?.removeAllRanges();
        sel?.addRange(range);
    }, []);

    // ── Insert / update hyperlink ──────────────────────────────────────────
    const doInsertLink = useCallback(() => {
        const raw = linkHref.trim();
        if (!raw) return;
        const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        editorRef.current?.focus();
        restoreSelection(savedRange);

        const sel = window.getSelection?.();
        if (sel?.toString()) {
            document.execCommand("createLink", false, url);
            // Set target + rel on the newly created anchor(s)
            editorRef.current
                ?.querySelectorAll(`a[href="${url}"]`)
                .forEach((a) => {
                    a.target = "_blank";
                    a.rel = "noopener noreferrer";
                });
        } else {
            const text = linkLabel.trim() || url;
            const anchor = `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
            document.execCommand("insertHTML", false, anchor);
        }

        setShowLink(false);
        setLinkHref("");
        setLinkLabel("");
        push();
    }, [linkHref, linkLabel, savedRange, restoreSelection, push]);

    // ── Insert component placeholder ───────────────────────────────────────
    const doInsertComponent = useCallback(
        (comp) => {
            editorRef.current?.focus();
            const { icon, name } = comp;
            // contenteditable="false" makes it uneditable but selectable/deletable
            const html =
                `<div data-component="${name}" contenteditable="false" class="component-placeholder">` +
                `${icon} <span>${name}</span></div><p><br></p>`;
            document.execCommand("insertHTML", false, html);
            setShowComps(false);
            push();
        },
        [push]
    );

    // ── Paste handler: sanitize incoming HTML ──────────────────────────────
    const handlePaste = useCallback(
        (e) => {
            e.preventDefault();
            const html = e.clipboardData.getData("text/html");
            const plain = e.clipboardData.getData("text/plain");
            if (html) {
                document.execCommand("insertHTML", false, sanitizeHtml(html));
            } else {
                document.execCommand("insertText", false, plain);
            }
            push();
        },
        [push]
    );

    // ── Upload inline image and insert as responsive <figure> ─────────────
    const handleImageFile = useCallback(
        async (file) => {
            if (!file || !onImageUpload) return;
            const url = await onImageUpload(file);
            if (!url) return;
            editorRef.current?.focus();
            document.execCommand(
                "insertHTML",
                false,
                `<figure class="blog-figure">` +
                `<img src="${url}" alt="" loading="lazy" ` +
                `style="max-width:100%;height:auto;display:block;border-radius:8px;margin:0 auto;">` +
                `</figure><p><br></p>`
            );
            push();
        },
        [onImageUpload, push]
    );

    // ─── Format block options ─────────────────────────────────────────────
    const FORMAT_OPTS = [
        { tag: "p", label: "Paragraph" },
        { tag: "h2", label: "Heading 2" },
        { tag: "h3", label: "Heading 3" },
        { tag: "h4", label: "Heading 4" },
        { tag: "blockquote", label: "Blockquote" },
        { tag: "pre", label: "Code Block" },
    ];

    // ─── Render ───────────────────────────────────────────────────────────
    return (
        <div className="border rounded-xl overflow-visible bg-white shadow-sm focus-within:ring-2 focus-within:ring-teal-300 focus-within:border-teal-300 transition-shadow">

            {/* ═══ Toolbar ═══════════════════════════════════════════════════════ */}
            <div
                className="
          sticky top-0 z-20
          flex flex-wrap items-center gap-0.5
          px-2 py-1.5 border-b
          bg-gray-50/95 backdrop-blur-sm
          rounded-t-xl
        "
            >
                {/* ── Block format ── */}
                <select
                    value={blockFmt}
                    onChange={(e) => exec("formatBlock", e.target.value)}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="
            text-sm bg-white border border-gray-200 rounded-lg
            px-2 py-1 text-gray-700
            focus:outline-none focus:ring-1 focus:ring-teal-300 cursor-pointer
          "
                >
                    {FORMAT_OPTS.map((o) => (
                        <option key={o.tag} value={o.tag}>{o.label}</option>
                    ))}
                </select>

                <Divider />

                {/* ── Text styles ── */}
                <Btn onMouseDown={() => exec("bold")} active={cmd.bold} title="Bold (Ctrl+B)">
                    <strong>B</strong>
                </Btn>
                <Btn onMouseDown={() => exec("italic")} active={cmd.italic} title="Italic (Ctrl+I)">
                    <em>I</em>
                </Btn>
                <Btn onMouseDown={() => exec("underline")} active={cmd.underline} title="Underline (Ctrl+U)">
                    <u>U</u>
                </Btn>
                <Btn onMouseDown={() => exec("strikeThrough")} active={cmd.strike} title="Strikethrough">
                    <s>S</s>
                </Btn>

                <Divider />

                {/* ── Alignment ── */}
                <Btn onMouseDown={() => exec("justifyLeft")} active={cmd.alignLeft} title="Align Left">
                    <AlignLeftIcon />
                </Btn>
                <Btn onMouseDown={() => exec("justifyCenter")} active={cmd.alignCenter} title="Center">
                    <AlignCenterIcon />
                </Btn>
                <Btn onMouseDown={() => exec("justifyRight")} active={cmd.alignRight} title="Align Right">
                    <AlignRightIcon />
                </Btn>
                <Btn onMouseDown={() => exec("justifyFull")} active={cmd.alignJustify} title="Justify">
                    <AlignJustifyIcon />
                </Btn>

                <Divider />

                {/* ── Lists ── */}
                <Btn onMouseDown={() => exec("insertUnorderedList")} active={cmd.ul} title="Bullet List">
                    • List
                </Btn>
                <Btn onMouseDown={() => exec("insertOrderedList")} active={cmd.ol} title="Numbered List">
                    1. List
                </Btn>

                <Divider />

                {/* ── Link ── */}
                <Btn
                    onMouseDown={() => {
                        saveSelection();
                        setShowLink((v) => !v);
                    }}
                    active={showLink}
                    title="Insert / Edit Link"
                >
                    🔗 Link
                </Btn>
                <Btn onMouseDown={() => exec("unlink")} title="Remove Link">
                    <span className="opacity-50 line-through">🔗</span>
                </Btn>

                <Divider />

                {/* ── Image upload ── */}
                <label
                    className="
            px-2 py-1.5 rounded text-sm leading-none
            text-gray-600 hover:bg-gray-100 hover:text-gray-900
            cursor-pointer transition-colors select-none
          "
                    title="Upload Image"
                    onMouseDown={(e) => e.preventDefault()}
                >
                    🖼️ Image
                    <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (f) handleImageFile(f);
                        }}
                    />
                </label>

                <Divider />

                {/* ── Component injector ── */}
                <div className="relative">
                    <Btn
                        onMouseDown={() => setShowComps((v) => !v)}
                        active={showComps}
                        title="Insert Dynamic Component"
                    >
                        ⚡ Component ▾
                    </Btn>

                    {showComps && (
                        <>
                            {/* Click-away overlay */}
                            <div
                                className="fixed inset-0 z-30"
                                onMouseDown={() => setShowComps(false)}
                            />
                            <div className="absolute top-full left-0 mt-1.5 bg-white border rounded-xl shadow-xl z-40 w-56 py-1.5 overflow-hidden">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 px-4 pt-2 pb-1.5">
                                    Inject Component
                                </p>
                                {INJECTABLE_COMPONENTS.map((c) => (
                                    <button
                                        key={c.name}
                                        type="button"
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            doInsertComponent(c);
                                        }}
                                        className="
                      flex items-center gap-2.5 w-full text-left
                      px-4 py-2 text-sm text-gray-700
                      hover:bg-teal-50 hover:text-teal-700
                      transition-colors
                    "
                                    >
                                        <span>{c.icon}</span>
                                        <span>{c.label}</span>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                <Divider />

                {/* ── Undo / Redo ── */}
                <Btn onMouseDown={() => exec("undo")} title="Undo (Ctrl+Z)">↩</Btn>
                <Btn onMouseDown={() => exec("redo")} title="Redo (Ctrl+Y)">↪</Btn>
            </div>

            {/* ═══ Link dialog ════════════════════════════════════════════════════ */}
            {showLink && (
                <div className="border-b px-4 py-3 bg-blue-50 flex flex-wrap gap-2 items-center">
                    <input
                        autoFocus
                        type="url"
                        placeholder="https://example.com"
                        value={linkHref}
                        onChange={(e) => setLinkHref(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") doInsertLink();
                            if (e.key === "Escape") setShowLink(false);
                        }}
                        className="
              flex-1 text-sm border rounded-lg px-3 py-1.5 bg-white
              focus:outline-none focus:ring-2 focus:ring-teal-300
              min-w-[180px]
            "
                    />
                    {!linkLabel && (
                        <input
                            type="text"
                            placeholder="Link text (optional)"
                            value={linkLabel}
                            onChange={(e) => setLinkLabel(e.target.value)}
                            className="
                flex-1 text-sm border rounded-lg px-3 py-1.5 bg-white
                focus:outline-none focus:ring-2 focus:ring-teal-300
                min-w-[160px]
              "
                        />
                    )}
                    <button
                        type="button"
                        onClick={doInsertLink}
                        className="bg-teal-600 text-white text-sm px-4 py-1.5 rounded-lg font-semibold hover:bg-teal-700 transition"
                    >
                        Insert
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowLink(false)}
                        className="text-sm text-gray-600 hover:text-gray-700 px-1"
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* ═══ Editable content area ══════════════════════════════════════════ */}
            <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={push}
                onKeyUp={refreshToolbar}
                onMouseUp={refreshToolbar}
                onSelect={refreshToolbar}
                onPaste={handlePaste}
                className="rich-editor-body min-h-[420px] p-6 focus:outline-none blog-content"
                style={{ wordBreak: "break-word", overflowWrap: "break-word" }}
                data-placeholder="Start writing or paste content here…"
                aria-label="Blog content editor"
                role="textbox"
                aria-multiline="true"
                onClick={handleEditorClick}
            />
            {/* ═══ Alt text modal ════════════════════════════════════════════════════ */}
{altModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
       onMouseDown={() => setAltModal(null)}>
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4"
         onMouseDown={(e) => e.stopPropagation()}>
      <h3 className="font-bold text-gray-800 text-base">Edit Image Alt Text</h3>
      <img
        src={altModal.node.src}
        alt=""
        className="w-full max-h-40 object-contain rounded-lg border bg-gray-50"
      />
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
          Alt text
        </label>
        <input
          autoFocus
          type="text"
          value={altModal.alt}
          onChange={(e) => setAltModal((m) => ({ ...m, alt: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === "Enter")  doSaveAlt();
            if (e.key === "Escape") setAltModal(null);
          }}
          placeholder="Describe the image for screen readers & SEO"
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
        />
        <p className="text-xs text-gray-600 mt-1">
          Shown when image fails to load. Improves accessibility and SEO.
        </p>
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => setAltModal(null)}
          className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={doSaveAlt}
          className="px-5 py-2 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition"
        >
          Save
        </button>
      </div>
    </div>
  </div>
)}
        </div>
    );
}

// ─── Alignment SVG icons (16×16) ─────────────────────────────────────────────
function AlignLeftIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
            <line x1="2" y1="4" x2="13" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="2" y1="7" x2="9" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="2" y1="10" x2="13" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="2" y1="13" x2="7" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}
function AlignCenterIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
            <line x1="2" y1="4" x2="13" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="4" y1="7" x2="11" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="2" y1="10" x2="13" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="4" y1="13" x2="11" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}
function AlignRightIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
            <line x1="2" y1="4" x2="13" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="6" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="2" y1="10" x2="13" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="8" y1="13" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}
function AlignJustifyIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
            <line x1="2" y1="4" x2="13" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="2" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="2" y1="10" x2="13" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="2" y1="13" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}
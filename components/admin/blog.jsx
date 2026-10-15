"use client";

import "@/app/styles/blog.css";
import { useEffect, useState, useCallback } from "react";
import { db } from "@/firebase/firebase.config";
import { storage } from "@/firebase/firebase.storage";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy, where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import Image from "next/image";
import { BlogDetailLayout } from "@/components/blog/BlogLayouts";
import { BLOG_LAYOUTS, addIdsToHeadings, safeDownloadUrl } from "@/components/blog/BlogUtils";
import RichEditor from "@/components/blog/RichEditor";

const EMPTY_SEO = {
  metaTitle: "", metaDescription: "", focusKeyword: "",
  canonicalUrl: "", ogTitle: "", ogDescription: "",
};
const EMPTY_FORM = {
  title: "", slug: "", excerpt: "", content: "",
  image: "", status: "draft", layout: "default",
  tags: [], seo: { ...EMPTY_SEO },
  showTOC: false, tocPosition: "sidebar",
  authorName: "", authorRole: "", authorBio: "",
  downloadUrl: "", downloadLabel: "", downloadEyebrow: "", downloadDescription: "",
  downloadButtonText: "", downloadNote: "", downloadImage: "",
};

const DOWNLOAD_FIELDS = [
  "downloadUrl", "downloadLabel", "downloadEyebrow", "downloadDescription",
  "downloadButtonText", "downloadNote", "downloadImage",
];

const slugify = (t) =>
  t.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().replace(/\s+/g, "-");

const calcReadingTime = (html) => {
  const words = html.replace(/<[^>]+>/g, "").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
};

const calcSeoScore = (form) => {
  let s = 0;
  const kw    = (form.seo?.focusKeyword || "").toLowerCase();
  const body  = (form.content || "").toLowerCase().replace(/<[^>]+>/g, "");
  const meta  = (form.seo?.metaDescription || "").toLowerCase();
  const title = (form.title || "").toLowerCase();
  const mtitle = (form.seo?.metaTitle || "").toLowerCase();
  const og    = (form.seo?.ogTitle || "").toLowerCase();
  if (kw) {
    if (title.includes(kw))  s += 20;
    if (body.includes(kw))   s += 20;
    if (meta.includes(kw))   s += 15;
    if (mtitle.includes(kw)) s += 10;
    if (og.includes(kw))     s += 5;
  }
  if (meta.length >= 120 && meta.length <= 160) s += 15;
  if (body.split(/\s+/).filter(Boolean).length > 300) s += 10;
  if (form.image) s += 5;
  return Math.min(s, 100);
};

const scoreLabel = (s) => {
  if (s >= 75) return { label: "Good", color: "text-green-600", bg: "bg-green-50 border-green-200" };
  if (s >= 45) return { label: "OK",   color: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200" };
  return { label: "Poor", color: "text-red-500", bg: "bg-red-50 border-red-200" };
};

const generateTOCPreview = (html) => {
  if (typeof window === "undefined") return [];
  const el = document.createElement("div");
  el.innerHTML = html;
  return [...el.querySelectorAll("h1,h2,h3")].map((h, i) => ({
    id: `toc-${i}`, text: h.textContent, level: +h.tagName[1],
  }));
};

async function hydrateImages(html, imageMap) {
  if (!imageMap || !Object.keys(imageMap).length) return html;
  const uploads = await Promise.all(
    Object.entries(imageMap).map(async ([uuid, { base64, mimeType }]) => {
      const ext = (mimeType || "image/png").split("/")[1] || "png";
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: mimeType });
      const sRef = ref(storage, `blogs/${Date.now()}-${uuid}.${ext}`);
      await uploadBytes(sRef, blob);
      const url = await getDownloadURL(sRef);
      return [uuid, url];
    })
  );
  const urlMap = Object.fromEntries(uploads);
  let out = html;
  for (const [uuid, url] of Object.entries(urlMap)) {
    out = out.replaceAll(`src="${uuid}"`, `src="${url}"`);
  }
  return out;
}

const revalidateBlog = async (brand, slug) => {
  try {
    await fetch("/api/revalidate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand, slug, secret: process.env.NEXT_PUBLIC_REVALIDATE_SECRET }),
    });
  } catch (err) {
    console.warn("[revalidate] failed:", err);
  }
};

// Site-relative paths ("/downloads/x.pdf") live on the public site, not on
// Blog Master, so resolve them against the brand's siteUrl for the preview.
const toSiteUrl = (path, siteUrl) =>
  path && path.startsWith("/") && !path.startsWith("//") && siteUrl ? siteUrl.replace(/\/$/, "") + path : path;

function buildPreviewBlog(form, orgName, siteUrl) {
  return {
    ...form,
    orgName,
    downloadUrl:   toSiteUrl(form.downloadUrl, siteUrl),
    downloadImage: toSiteUrl(form.downloadImage, siteUrl),
    id: "__preview__",
    status: "published",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    readingTime: calcReadingTime(form.content),
    seo: { ...form.seo, canonicalUrl: form.seo?.canonicalUrl || `/blog/${form.slug || "preview"}` },
  };
}

// brand    — e.g. "shark-web-digital"
// brandConfig — the BRANDS entry with siteUrl etc.
export default function BlogManager({ brand, brandConfig }) {
  const [blogs, setBlogs]         = useState([]);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [selected, setSelected]   = useState([]);
  const [toc, setToc]             = useState([]);
  const [score, setScore]         = useState(0);
  const [phase, setPhase]         = useState("idle");
  const [convError, setConvError] = useState(null);
  const [tab, setTab]             = useState("content");
  const [editorKey, setEditorKey] = useState(0);

  const loadBlogs = useCallback(async () => {
    const snap = await getDocs(
      query(collection(db, "blogs"), where("brand", "==", brand), orderBy("createdAt", "desc"))
    );
    setBlogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, [brand]);

  useEffect(() => { loadBlogs(); setForm(EMPTY_FORM); setPhase("idle"); setEditorKey((k) => k + 1); }, [loadBlogs]);

  useEffect(() => {
    setToc(generateTOCPreview(form.content));
    setScore(calcSeoScore(form));
  }, [form]);

  const handleInlineImageUpload = useCallback(async (file) => {
    try {
      const ext = file.name.split(".").pop() || "png";
      const sRef = ref(storage, `blogs/inline/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
      await uploadBytes(sRef, file);
      return await getDownloadURL(sRef);
    } catch (err) {
      console.error("[inline-image-upload]", err);
      return null;
    }
  }, []);

  const handleDocxUpload = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setPhase("converting");
    setConvError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/convert-docx", { method: "POST", body: fd });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Conversion failed"); }
      const { html, imageMap } = await res.json();
      const hydrated = await hydrateImages(html, imageMap);
      const withIds = addIdsToHeadings(hydrated);
      setForm((p) => ({ ...p, content: withIds }));
      setEditorKey((k) => k + 1);
      setPhase("preview");
    } catch (err) {
      setConvError(err.message);
      setPhase("idle");
    }
  };

  const handleCoverUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const sRef = ref(storage, `blogs/covers/${Date.now()}.${file.name.split(".").pop()}`);
    await uploadBytes(sRef, file);
    const url = await getDownloadURL(sRef);
    setForm((p) => ({ ...p, image: url }));
  };

  // Slug of the post as stored in Firestore (empty for new posts). Once a post
  // has a saved slug it is its live URL, so title edits must not change it.
  const savedSlug = editingId ? blogs.find((b) => b.id === editingId)?.slug || "" : "";

  const set = (field, value) =>
    setForm((p) => ({
      ...p,
      [field]: value,
      ...(field === "title" && !savedSlug ? { slug: slugify(value) } : {}),
    }));

  const setSeo = (field, value) =>
    setForm((p) => ({ ...p, seo: { ...p.seo, [field]: value } }));

  const addTag = (raw) => {
    const t = raw.trim().toLowerCase();
    if (t && !form.tags.includes(t)) setForm((p) => ({ ...p, tags: [...p.tags, t] }));
  };
  const removeTag = (t) => setForm((p) => ({ ...p, tags: p.tags.filter((x) => x !== t) }));

  const handleSubmit = async () => {
    if (!form.title || !form.content) { alert("Title and Content required."); return; }
    const payload = { ...form, brand, readingTime: calcReadingTime(form.content), updatedAt: serverTimestamp() };
    if (editingId) {
      await updateDoc(doc(db, "blogs", editingId), payload);
    } else {
      await addDoc(collection(db, "blogs"), { ...payload, createdAt: serverTimestamp() });
    }
    await revalidateBlog(brand, form.slug);
    reset();
    loadBlogs();
  };

  const reset = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setPhase("idle");
    setTab("content");
    setEditorKey((k) => k + 1);
  };

  const handleEdit = (blog) => {
    setForm({ ...blog, tags: blog.tags || [], layout: blog.layout || "default",
      showTOC: blog.showTOC ?? false, tocPosition: blog.tocPosition || "sidebar",
      authorName: blog.authorName || "", authorRole: blog.authorRole || "", authorBio: blog.authorBio || "",
      ...Object.fromEntries(DOWNLOAD_FIELDS.map((f) => [f, blog[f] || ""])),
      seo: { ...EMPTY_SEO, ...(blog.seo || {}) } });
    setEditingId(blog.id);
    setPhase("editing");
    setTab("content");
    setEditorKey((k) => k + 1);
  };

  const deleteBlogs = async (ids) => {
    if (!confirm("Delete selected?")) return;
    const slugsToInvalidate = ids.map((id) => blogs.find((b) => b.id === id)?.slug).filter(Boolean);
    await Promise.all(ids.map((id) => deleteDoc(doc(db, "blogs", id))));
    await Promise.all(slugsToInvalidate.map((slug) => revalidateBlog(brand, slug)));
    setSelected([]);
    loadBlogs();
  };

  const { label: sLabel, color: sColor, bg: sBg } = scoreLabel(score);
  const currentLayout = BLOG_LAYOUTS.find((l) => l.value === form.layout) || BLOG_LAYOUTS[0];
  const TABS = [["content","Content"],["layout","Layout & TOC"],["seo","SEO"],["toc","TOC Preview"]];
  const siteUrl = brandConfig?.siteUrl || "";

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Blog Manager</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Writing for <span className="font-semibold text-gray-700">{brandConfig?.name}</span>
            {siteUrl && <> · <a href={siteUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">{siteUrl} ↗</a></>}
          </p>
        </div>
        {phase !== "idle" && (
          <div className="flex items-center gap-3">
            {phase === "editing" && (
              <button onClick={() => setPhase("livepreview")}
                className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-4 py-2 rounded-lg transition">
                <EyeIcon /> Live Preview
              </button>
            )}
            {phase === "livepreview" && (
              <button onClick={() => setPhase("editing")}
                className="flex items-center gap-1.5 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-4 py-2 rounded-lg transition">
                ← Back to Editor
              </button>
            )}
            <button onClick={reset} className="text-sm text-gray-500 hover:text-gray-700 underline">Cancel</button>
          </div>
        )}
      </div>

      {/* IDLE */}
      {phase === "idle" && (
        <div className="space-y-3">
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl p-14 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all group">
            <div className="text-5xl mb-3 group-hover:scale-110 transition-transform">📄</div>
            <p className="font-semibold text-gray-700">Upload a .docx file</p>
            <p className="text-sm text-gray-500 mt-1">Converts instantly — preview before publishing</p>
            <input type="file" accept=".docx" className="hidden" onChange={handleDocxUpload} />
          </label>
          {convError && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">⚠️ {convError}</div>}
        </div>
      )}

      {/* CONVERTING */}
      {phase === "converting" && (
        <div className="flex flex-col items-center py-20 space-y-4">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="font-medium text-gray-600">Converting document…</p>
        </div>
      )}

      {/* DOCX PREVIEW */}
      {phase === "preview" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
            <div>
              <p className="font-semibold text-amber-800 text-sm">📋 Preview — exactly how your blog will appear</p>
              <p className="text-xs text-amber-600 mt-0.5">Alignment, colors and fonts are preserved from the document.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPhase("editing")} className="bg-white border border-amber-300 text-amber-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-amber-50 transition">✏️ Edit</button>
              <button onClick={handleSubmit} className="bg-indigo-600 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-indigo-700 transition">🚀 Publish</button>
            </div>
          </div>
          <div className="bg-white rounded-xl border shadow-sm p-8">
            <article className="blog-content" dangerouslySetInnerHTML={{ __html: form.content }} />
          </div>
        </div>
      )}

      {/* LIVE PREVIEW */}
      {phase === "livepreview" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-3">
            <p className="font-semibold text-indigo-800 text-sm">
              👁 Live Preview — <span className="font-bold capitalize">{currentLayout.label}</span> layout
            </p>
            <div className="flex gap-2">
              <select value={form.layout} onChange={(e) => set("layout", e.target.value)}
                className="text-sm border border-indigo-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                {BLOG_LAYOUTS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
              <button onClick={handleSubmit} className="bg-indigo-600 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-indigo-700 transition">
                🚀 {editingId ? "Update" : "Publish"}
              </button>
            </div>
          </div>
          <div className="border rounded-2xl overflow-hidden shadow-sm bg-white">
            <BlogDetailLayout blog={buildPreviewBlog(form, brandConfig?.name, brandConfig?.siteUrl)} allPosts={[]} />
          </div>
        </div>
      )}

      {/* EDITING */}
      {phase === "editing" && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-500">Replace document:</span>
            <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg border text-xs transition">
              Choose .docx <input type="file" accept=".docx" className="hidden" onChange={handleDocxUpload} />
            </label>
          </div>

          <div className="flex gap-0 border-b overflow-x-auto">
            {TABS.map(([key, lbl]) => (
              <button key={key} onClick={() => setTab(key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap ${
                  tab === key ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"
                }`}>
                {lbl}{key === "seo" && <span className={`ml-2 text-xs font-bold ${sColor}`}>{score}</span>}
              </button>
            ))}
          </div>

          {/* CONTENT TAB */}
          {tab === "content" && (
            <div className="space-y-4">
              <Field label="Blog Title" required>
                <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Enter blog title" className="input" />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Slug">
                  <input value={form.slug} onChange={(e) => set("slug", e.target.value)} className="input font-mono text-sm text-gray-500" />
                </Field>
                <Field label="Reading Time">
                  <div className="input bg-gray-50 text-gray-500 text-sm">⏱ {calcReadingTime(form.content)} min</div>
                </Field>
              </div>
              <Field label="Cover Image">
                <input type="file" accept="image/*" onChange={handleCoverUpload} className="text-sm" />
                {form.image && (
                  <div className="mt-2">
                    <Image src={form.image} alt="Cover" width={320} height={180} className="rounded-lg object-cover border" />
                  </div>
                )}
              </Field>
              <Field label="Excerpt">
                <textarea rows={3} value={form.excerpt} onChange={(e) => set("excerpt", e.target.value)}
                  placeholder="Short description shown in listings" className="input" />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Author Name" hint="Optional — leave empty to credit the brand">
                  <input value={form.authorName} onChange={(e) => set("authorName", e.target.value)}
                    placeholder="e.g. Priya Sharma" className="input" />
                </Field>
                <Field label="Author Role">
                  <input value={form.authorRole} onChange={(e) => set("authorRole", e.target.value)}
                    placeholder="e.g. Cleaning Operations Lead" className="input" />
                </Field>
              </div>
              <Field label="Author Bio" hint={`Short bio shown under the post (${(form.authorBio || "").length}/300)`}>
                <textarea rows={2} maxLength={300} value={form.authorBio} onChange={(e) => set("authorBio", e.target.value)}
                  placeholder="1–2 sentences on the author's experience" className="input" />
              </Field>
              <fieldset className="space-y-4 rounded-xl border p-4">
                <legend className="px-1 text-sm font-semibold text-gray-700">Download card (optional)</legend>
                <p className="text-xs text-gray-500">Shown above the article when a link is set. Leave the other fields empty to use defaults.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Download Link" hint={form.downloadUrl && !safeDownloadUrl(form.downloadUrl)
                      ? "Use a site path starting with / or an https:// link" : "e.g. /downloads/checklist.pdf"}
                    hintRed={Boolean(form.downloadUrl) && !safeDownloadUrl(form.downloadUrl)}>
                    <input value={form.downloadUrl} onChange={(e) => set("downloadUrl", e.target.value)}
                      placeholder="/downloads/file.pdf or https://…" className="input font-mono text-sm" />
                  </Field>
                  <Field label="Preview Image" hint="Picture of the file, e.g. /downloads/checklist-preview.webp"
                    hintRed={Boolean(form.downloadImage) && !safeDownloadUrl(form.downloadImage)}>
                    <input value={form.downloadImage} onChange={(e) => set("downloadImage", e.target.value)}
                      placeholder="/downloads/file-preview.webp" className="input font-mono text-sm" />
                  </Field>
                  <Field label="Small Heading">
                    <input value={form.downloadEyebrow} onChange={(e) => set("downloadEyebrow", e.target.value)}
                      placeholder="Free printable · PDF · 1 page" className="input" />
                  </Field>
                  <Field label="Title">
                    <input value={form.downloadLabel} onChange={(e) => set("downloadLabel", e.target.value)}
                      placeholder="Download the Diwali Cleaning Checklist 2026" className="input" />
                  </Field>
                </div>
                <Field label="Description">
                  <textarea rows={2} value={form.downloadDescription} onChange={(e) => set("downloadDescription", e.target.value)}
                    placeholder="What the file contains and how to use it" className="input" />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Button Text">
                    <input value={form.downloadButtonText} onChange={(e) => set("downloadButtonText", e.target.value)}
                      placeholder="Download free checklist (PDF)" className="input" />
                  </Field>
                  <Field label="Note Under Button">
                    <input value={form.downloadNote} onChange={(e) => set("downloadNote", e.target.value)}
                      placeholder="Print tip: choose A4 and “Actual size”." className="input" />
                  </Field>
                </div>
              </fieldset>
              <Field label="Tags">
                <div className="flex flex-wrap gap-2 mb-2">
                  {(form.tags || []).map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 text-xs px-2.5 py-1 rounded-full">
                      {t}<button onClick={() => removeTag(t)} className="hover:text-red-500 leading-none">×</button>
                    </span>
                  ))}
                </div>
                <input placeholder="Type a tag and press Enter" className="input text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(e.target.value); e.target.value = ""; } }} />
              </Field>
              <Field label="Content" required>
                <RichEditor key={editorKey} value={form.content} onChange={(html) => set("content", html)} onImageUpload={handleInlineImageUpload} />
              </Field>
              <details className="border rounded-xl overflow-hidden">
                <summary className="px-5 py-3 text-sm font-medium text-gray-600 cursor-pointer hover:bg-gray-50 select-none">👁 Raw HTML Preview</summary>
                <div className="p-8 border-t bg-white">
                  <article className="blog-content" dangerouslySetInnerHTML={{ __html: form.content }} />
                </div>
              </details>
              <div className="flex items-center gap-3 pt-2 flex-wrap">
                <select value={form.status} onChange={(e) => set("status", e.target.value)} className="input w-auto">
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
                <button onClick={handleSubmit} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-3 rounded-lg transition min-w-[140px]">
                  {editingId ? "Update Blog" : "Publish Blog"}
                </button>
              </div>
            </div>
          )}

          {/* LAYOUT TAB */}
          {tab === "layout" && (
            <div className="space-y-8">
              <Field label="Blog Layout" hint="Controls how the blog renders publicly.">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {BLOG_LAYOUTS.map((l) => (
                    <button key={l.value} type="button" onClick={() => set("layout", l.value)}
                      className={`flex items-start gap-3 text-left p-4 rounded-xl border-2 transition-all ${
                        form.layout === l.value ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white hover:border-gray-300"
                      }`}>
                      <span className="text-2xl mt-0.5">{LAYOUT_ICONS[l.value]}</span>
                      <div>
                        <p className={`font-bold text-sm ${form.layout === l.value ? "text-indigo-600" : "text-gray-800"}`}>
                          {l.label}
                          {form.layout === l.value && <span className="ml-2 text-[10px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-100 px-2 py-0.5 rounded-full">selected</span>}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">{l.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </Field>
              <div className="border rounded-xl p-5 bg-gray-50 space-y-4">
                <h3 className="font-bold text-gray-800 text-sm">Table of Contents</h3>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Show Table of Contents</p>
                    <p className="text-xs text-gray-500 mt-0.5">Auto-generated from headings</p>
                  </div>
                  <button type="button" role="switch" aria-checked={form.showTOC} onClick={() => set("showTOC", !form.showTOC)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.showTOC ? "bg-indigo-600" : "bg-gray-300"}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.showTOC ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>
                {form.showTOC && (
                  <div className="grid grid-cols-2 gap-3">
                    {[{value:"sidebar",label:"Sidebar",icon:"⬅️"},{value:"inline",label:"Inline",icon:"⬆️"}].map((opt) => (
                      <button key={opt.value} type="button" onClick={() => set("tocPosition", opt.value)}
                        className={`flex items-center gap-2 p-3 rounded-xl border-2 transition ${form.tocPosition === opt.value ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:border-gray-300"}`}>
                        <span>{opt.icon}</span>
                        <span className={`font-bold text-sm ${form.tocPosition === opt.value ? "text-indigo-600" : "text-gray-800"}`}>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-2 border-indigo-100 rounded-2xl overflow-hidden bg-white shadow-sm" style={{ maxHeight: "70vh", overflowY: "auto" }}>
                <BlogDetailLayout blog={buildPreviewBlog(form, brandConfig?.name, brandConfig?.siteUrl)} allPosts={[]} />
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <select value={form.status} onChange={(e) => set("status", e.target.value)} className="input w-auto">
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
                <button onClick={handleSubmit} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-3 rounded-lg transition min-w-[140px]">
                  {editingId ? "Update Blog" : "Publish Blog"}
                </button>
              </div>
            </div>
          )}

          {/* SEO TAB */}
          {tab === "seo" && (
            <div className="space-y-5">
              <div className={`flex items-center justify-between p-5 rounded-xl border ${sBg}`}>
                <div><p className="font-semibold text-gray-800">SEO Score</p></div>
                <div className="text-right">
                  <p className={`text-4xl font-black ${sColor}`}>{score}</p>
                  <p className={`text-xs font-bold ${sColor}`}>{sLabel}</p>
                </div>
              </div>
              <SeoChecklist form={form} />
              <hr />
              <Field label="Focus Keyword" hint="The keyword you want this page to rank for.">
                <input value={form.seo.focusKeyword} onChange={(e) => setSeo("focusKeyword", e.target.value)} placeholder="e.g. home cleaning services" className="input" />
              </Field>
              <Field label="Meta Title" hint={`${form.seo.metaTitle.length}/60 chars`} hintRed={form.seo.metaTitle.length > 60}>
                <input value={form.seo.metaTitle} onChange={(e) => setSeo("metaTitle", e.target.value)} placeholder="Shown in Google results" className="input" />
              </Field>
              <Field label="Meta Description" hint={`${form.seo.metaDescription.length}/160 chars`} hintRed={form.seo.metaDescription.length > 160}>
                <textarea rows={3} value={form.seo.metaDescription} onChange={(e) => setSeo("metaDescription", e.target.value)} placeholder="Shown below title in search results" className="input" />
              </Field>
              <Field label="Canonical URL">
                <input value={form.seo.canonicalUrl} onChange={(e) => setSeo("canonicalUrl", e.target.value)}
                  placeholder={`${siteUrl}/blog/${form.slug || "slug"}`} className="input" />
              </Field>
              <Field label="OG Title"><input value={form.seo.ogTitle} onChange={(e) => setSeo("ogTitle", e.target.value)} placeholder="Defaults to Meta Title if blank" className="input" /></Field>
              <Field label="OG Description"><textarea rows={2} value={form.seo.ogDescription} onChange={(e) => setSeo("ogDescription", e.target.value)} placeholder="Defaults to Meta Description if blank" className="input" /></Field>
              <div className="border rounded-xl p-5 bg-white shadow-sm">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-4">Google Preview</p>
                <p className="text-xs text-green-700 truncate">{form.seo.canonicalUrl || `${siteUrl}/blog/${form.slug || "slug"}`}</p>
                <p className="text-[#1a0dab] text-xl leading-snug line-clamp-1 hover:underline">{form.seo.metaTitle || form.title || "Page Title"}</p>
                <p className="text-sm text-gray-600 line-clamp-2">{form.seo.metaDescription || form.excerpt || "Meta description…"}</p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <select value={form.status} onChange={(e) => set("status", e.target.value)} className="input w-auto">
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
                <button onClick={handleSubmit} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-3 rounded-lg transition min-w-[140px]">
                  {editingId ? "Update Blog" : "Publish Blog"}
                </button>
              </div>
            </div>
          )}

          {/* TOC PREVIEW TAB */}
          {tab === "toc" && (
            <div>
              {!form.showTOC && (
                <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed">
                  <p className="text-3xl mb-2">📋</p>
                  <p className="text-gray-500 text-sm">TOC is disabled. Enable it in Layout &amp; TOC tab.</p>
                </div>
              )}
              {form.showTOC && toc.length === 0 && (
                <p className="text-gray-500 text-sm py-12 text-center">No headings found in content.</p>
              )}
              {form.showTOC && toc.length > 0 && (
                <div className="bg-gray-50 border rounded-xl p-5 space-y-1.5">
                  {toc.map((item) => (
                    <div key={item.id} style={{ paddingLeft: `${(item.level - 1) * 16}px` }}
                      className="flex items-center gap-2 text-sm text-gray-700">
                      <span className="text-gray-300 text-xs font-mono">H{item.level}</span>
                      <span>{item.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Blog table */}
      <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold text-gray-800">All Blogs — {brandConfig?.name}</h2>
          <div className="flex gap-2 items-center">
            {selected.length > 0 && (
              <button onClick={() => deleteBlogs(selected)} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium">
                Delete ({selected.length})
              </button>
            )}
            <label className="cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition">
              + New from .docx <input type="file" accept=".docx" className="hidden" onChange={handleDocxUpload} />
            </label>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="p-3 w-8"></th>
                <th className="p-3 text-left">Title</th>
                <th className="p-3 text-left">Layout</th>
                <th className="p-3 text-left">TOC</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">SEO</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {blogs.length === 0 && (
                <tr><td colSpan={7} className="py-12 text-center text-gray-500 text-sm">No blogs yet. Upload a .docx to get started.</td></tr>
              )}
              {blogs.map((blog) => {
                const bs = calcSeoScore({ ...blog, seo: blog.seo || {} });
                const { color: bc, label: bl } = scoreLabel(bs);
                const layout = BLOG_LAYOUTS.find((l) => l.value === (blog.layout || "default"));
                return (
                  <tr key={blog.id} className="border-t hover:bg-gray-50 transition">
                    <td className="p-3">
                      <input type="checkbox" checked={selected.includes(blog.id)}
                        onChange={() => setSelected((p) => p.includes(blog.id) ? p.filter((x) => x !== blog.id) : [...p, blog.id])} />
                    </td>
                    <td className="p-3 font-medium text-gray-800 max-w-[200px] truncate">{blog.title}</td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
                        {LAYOUT_ICONS[layout?.value || "default"]} {layout?.label || "Default"}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${blog.showTOC ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600"}`}>
                        {blog.showTOC ? `✓ ${blog.tocPosition || "sidebar"}` : "Off"}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${blog.status === "published" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                        {blog.status}
                      </span>
                    </td>
                    <td className="p-3"><span className={`text-xs font-bold ${bc}`}>{bs} <span className="font-normal opacity-60">{bl}</span></span></td>
                    <td className="p-3">
                      <div className="flex gap-1.5 justify-center">
                        <button onClick={() => handleEdit(blog)} className="bg-orange-100 hover:bg-orange-200 text-orange-600 px-3 py-1 rounded text-xs font-medium">Edit</button>
                        <button onClick={() => deleteBlogs([blog.id])} className="bg-red-100 hover:bg-red-200 text-red-600 px-3 py-1 rounded text-xs font-medium">Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const LAYOUT_ICONS = { default:"📄", minimal:"📖", magazine:"📰", docs:"📚", cards:"🃏", hero:"🎨", timeline:"📅" };

function EyeIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M1 10C2.5 5.5 6 3 10 3s7.5 2.5 9 7c-1.5 4.5-5 7-9 7S2.5 14.5 1 10z" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function Field({ label, required, hint, hintRed, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label} {required && <span className="text-red-400">*</span>}</label>
      {children}
      {hint && <p className={`text-xs mt-1 ${hintRed ? "text-red-500" : "text-gray-500"}`}>{hint}</p>}
    </div>
  );
}

function SeoChecklist({ form }) {
  const kw    = (form.seo?.focusKeyword || "").toLowerCase();
  const body  = (form.content || "").toLowerCase().replace(/<[^>]+>/g, "");
  const meta  = (form.seo?.metaDescription || "").toLowerCase();
  const title = (form.title || "").toLowerCase();
  const words = body.split(/\s+/).filter(Boolean).length;
  const checks = [
    { label: "Focus keyword set",             pass: !!kw },
    { label: "Keyword in title",               pass: !!kw && title.includes(kw) },
    { label: "Keyword in content",             pass: !!kw && body.includes(kw) },
    { label: "Keyword in meta description",    pass: !!kw && meta.includes(kw) },
    { label: "Meta description 120–160 chars", pass: meta.length >= 120 && meta.length <= 160 },
    { label: "Content 300+ words",             pass: words >= 300 },
    { label: "Cover image uploaded",           pass: !!form.image },
    { label: "Meta title set",                 pass: !!form.seo?.metaTitle },
    { label: "Canonical URL set",              pass: !!form.seo?.canonicalUrl },
    { label: "OG title set",                   pass: !!form.seo?.ogTitle },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {checks.map(({ label, pass }) => (
        <div key={label} className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border ${pass ? "bg-green-50 border-green-200 text-green-700" : "bg-gray-50 border-gray-200 text-gray-500"}`}>
          <span>{pass ? "✅" : "○"}</span><span>{label}</span>
        </div>
      ))}
    </div>
  );
}

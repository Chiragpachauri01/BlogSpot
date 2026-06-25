"use client";

import { useEffect, useState, useCallback } from "react";
import { db } from "@/firebase/firebase.config";
import { storage } from "@/firebase/firebase.storage";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy, where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import Image from "next/image";
import { SERVICE_CATEGORIES, LOCATIONS, toSlug } from "@/lib/webstoryTaxonomy";

// Unique id for slides — Date.now() alone collides when slides are added in
// the same millisecond, producing duplicate React keys (and "leaking" images
// between slides). The counter guarantees uniqueness.
let slideIdSeq = 0;
const uid = () => `${Date.now()}-${slideIdSeq++}`;

const newSlide = (id = uid()) => ({ id, heading: "", body: "", image: "", alt: "", cta: { label: "", url: "" } });

// Factory (not a shared constant) so every reset/new story gets fresh,
// independent slide and cta objects instead of reusing one module-level ref.
const emptyForm = () => ({
  title: "",
  slug: "",
  excerpt: "",
  shortDescription: "",
  thumbnail: "",
  posterImage: "",          // portrait poster used by AMP + related-story cards
  status: "draft",
  serviceCategories: [],
  locations: [],
  tags: [],
  priority: 0,
  slides: [newSlide()],
});

const slugify = (t) =>
  t.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().replace(/\s+/g, "-");

// Trigger ISR on the brand site for the web-stories path (mirrors blog.jsx).
const revalidateStory = async (brand, slug) => {
  try {
    await fetch("/api/revalidate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand, slug, type: "webstory", secret: process.env.NEXT_PUBLIC_REVALIDATE_SECRET }),
    });
  } catch (err) {
    console.warn("[revalidate] failed:", err);
  }
};

// brand    — e.g. "shark-web-digital"
// brandConfig — the BRANDS entry with siteUrl etc.
export default function WebStoryManager({ brand, brandConfig }) {
  const [stories, setStories]     = useState([]);
  const [form, setForm]           = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [selected, setSelected]   = useState([]);
  const [phase, setPhase]         = useState("idle"); // idle | editing | preview
  const [activeSlide, setActiveSlide] = useState(0);
  const [tab, setTab]             = useState("slides");

  const loadStories = useCallback(async () => {
    const snap = await getDocs(
      query(collection(db, "webstories"), where("brand", "==", brand), orderBy("createdAt", "desc"))
    );
    setStories(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, [brand]);

  useEffect(() => { loadStories(); setForm(emptyForm()); setPhase("idle"); }, [loadStories]);

  const set = (field, value) =>
    setForm((p) => ({ ...p, [field]: value, ...(field === "title" ? { slug: slugify(value) } : {}) }));

  const setSlide = (idx, field, value) =>
    setForm((p) => {
      const slides = p.slides.map((s, i) => i === idx ? { ...s, [field]: value } : s);
      return { ...p, slides };
    });

  const setSlideCta = (idx, field, value) =>
    setForm((p) => {
      const slides = p.slides.map((s, i) =>
        i === idx ? { ...s, cta: { ...s.cta, [field]: value } } : s
      );
      return { ...p, slides };
    });

  const addSlide = () => {
    setForm((p) => {
      const slides = [...p.slides, newSlide()];
      setActiveSlide(slides.length - 1);
      return { ...p, slides };
    });
  };

  const removeSlide = (idx) => {
    if (form.slides.length === 1) return;
    setForm((p) => ({ ...p, slides: p.slides.filter((_, i) => i !== idx) }));
    setActiveSlide((a) => Math.min(a, form.slides.length - 2));
  };

  const moveSlide = (idx, dir) => {
    const next = idx + dir;
    if (next < 0 || next >= form.slides.length) return;
    setForm((p) => {
      const slides = [...p.slides];
      [slides[idx], slides[next]] = [slides[next], slides[idx]];
      return { ...p, slides };
    });
    setActiveSlide(next);
  };

  const handleThumbnailUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const sRef = ref(storage, `webstories/thumbnails/${Date.now()}.${file.name.split(".").pop()}`);
    await uploadBytes(sRef, file);
    const url = await getDownloadURL(sRef);
    setForm((p) => ({ ...p, thumbnail: url }));
  };

  const handleSlideImageUpload = async (e, idx) => {
    const file = e.target.files[0];
    if (!file) return;
    const sRef = ref(storage, `webstories/slides/${Date.now()}-${Math.random().toString(36).slice(2)}.${file.name.split(".").pop()}`);
    await uploadBytes(sRef, file);
    const url = await getDownloadURL(sRef);
    setSlide(idx, "image", url);
  };

  const handlePosterUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const sRef = ref(storage, `webstories/posters/${Date.now()}.${file.name.split(".").pop()}`);
    await uploadBytes(sRef, file);
    const url = await getDownloadURL(sRef);
    setForm((p) => ({ ...p, posterImage: url }));
  };

  // Toggle a slug in/out of an array field (serviceCategories | locations).
  const toggleInArray = (field, value) =>
    setForm((p) => {
      const arr = Array.isArray(p[field]) ? p[field] : [];
      return { ...p, [field]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] };
    });

  const addCustomToArray = (field, raw) => {
    const value = toSlug(raw);
    if (!value) return;
    setForm((p) => {
      const arr = Array.isArray(p[field]) ? p[field] : [];
      return arr.includes(value) ? p : { ...p, [field]: [...arr, value] };
    });
  };

  const handleSubmit = async () => {
    if (!form.title) { alert("Title is required."); return; }
    if (form.slides.length === 0) { alert("At least one slide is required."); return; }
    const isPublished = form.status === "published";

    // Build an EXPLICIT payload of known fields only. Spreading `...form` would
    // leak UI-only keys (e.g. the doc `id` carried in by handleEdit) into the
    // document, which both pollutes data and fails the Firestore `hasOnly`
    // security rule. Keep this list in sync with the rule's key whitelist.
    const payload = {
      title: form.title,
      slug: form.slug,
      excerpt: form.excerpt || "",
      shortDescription: form.shortDescription || "",
      thumbnail: form.thumbnail || "",
      posterImage: form.posterImage || "",
      status: form.status,
      serviceCategories: form.serviceCategories || [],
      locations: form.locations || [],
      tags: form.tags || [],
      priority: typeof form.priority === "number" ? form.priority : 0,
      // Persist only the slide fields the sites read — drop the UI-only key.
      slides: form.slides.map((s) => ({
        heading: s.heading || "",
        body: s.body || "",
        image: s.image || "",
        alt: s.alt || "",
        cta: { label: s.cta?.label || "", url: s.cta?.url || "" },
      })),
      brand,
      isPublished,
      // Stamp publishedAt the first time a story goes live; keep it stable after.
      ...(isPublished && !form.publishedAt ? { publishedAt: serverTimestamp() } : {}),
      updatedAt: serverTimestamp(),
    };
    if (editingId) {
      await updateDoc(doc(db, "webstories", editingId), payload);
    } else {
      await addDoc(collection(db, "webstories"), { ...payload, createdAt: serverTimestamp() });
    }
    await revalidateStory(brand, form.slug);
    reset();
    loadStories();
  };

  const reset = () => {
    setForm(emptyForm());
    setEditingId(null);
    setPhase("idle");
    setActiveSlide(0);
    setTab("slides");
    setSelected([]);
  };

  const handleEdit = (story) => {
    // Normalize slide ids so every slide has a unique, stable key. Older docs
    // saved id:1 for the first slide of every story, which collides as a React
    // key and made images appear to "leak" between slides.
    const slides = story.slides?.length
      ? story.slides.map((s) => ({ alt: "", ...s, id: uid() }))
      : [newSlide()];
    // Merge over emptyForm() so docs created before the targeting/SEO fields
    // existed still get safe defaults ([] arrays, "" strings) — otherwise
    // .includes()/.join() on undefined would throw in the editor.
    setForm({ ...emptyForm(), ...story, slides });
    setEditingId(story.id);
    setPhase("editing");
    setActiveSlide(0);
    setTab("slides");
  };

  const deleteStories = async (ids) => {
    if (!confirm("Delete selected?")) return;
    const slugsToInvalidate = ids.map((id) => stories.find((s) => s.id === id)?.slug).filter(Boolean);
    await Promise.all(ids.map((id) => deleteDoc(doc(db, "webstories", id))));
    await Promise.all(slugsToInvalidate.map((slug) => revalidateStory(brand, slug)));
    setSelected([]);
    loadStories();
  };

  const siteUrl = brandConfig?.siteUrl || "";
  const slide = form.slides[activeSlide] || form.slides[0];
  const TABS = [["slides", "Slides"], ["details", "Details"], ["targeting", "Targeting & SEO"]];

  // ── Advisory SEO checks (warnings only — never block publishing) ──────────
  // Mirrors Google Web Stories guidance so the SEO author publishes clean
  // stories by default. Each entry: { ok, msg }.
  const titleWords = form.title.trim().split(/\s+/).filter(Boolean).length;
  const seoChecks = [
    { ok: !!form.posterImage, msg: "Add a portrait poster image (≥ 640×853). Google needs it for Discover/Visual Stories." },
    { ok: form.title.length <= 70 && titleWords <= 10, msg: "Keep the title short (≤ 70 chars / ~10 words) — it gets truncated on the cover." },
    { ok: !!form.shortDescription, msg: "Add a short description — used in cards and meta description." },
    { ok: form.slides.length >= 5, msg: "Aim for at least 5 slides — very short stories rank poorly in Discover." },
    { ok: form.slides.length <= 30, msg: "Keep it under ~30 slides." },
    { ok: form.serviceCategories.length > 0, msg: "Tag at least one service category so this can show as a related story." },
    { ok: form.slides.every((s) => !s.image || s.alt), msg: "Add alt text to every slide image (accessibility + image SEO)." },
    { ok: form.slides.every((s) => (s.body || "").length <= 200), msg: "Keep slide text ≤ 200 characters for readability." },
  ];
  const seoWarnings = seoChecks.filter((c) => !c.ok);

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Web Story Manager</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Writing for <span className="font-semibold text-gray-700">{brandConfig?.name}</span>
            {siteUrl && <> · <a href={siteUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">{siteUrl} ↗</a></>}
          </p>
        </div>
        {phase !== "idle" && (
          <div className="flex items-center gap-3">
            {phase === "editing" && (
              <button onClick={() => setPhase("preview")}
                className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-4 py-2 rounded-lg transition">
                <EyeIcon /> Preview
              </button>
            )}
            {phase === "preview" && (
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
        <button
          onClick={() => { setForm(emptyForm()); setPhase("editing"); setActiveSlide(0); }}
          className="flex flex-col items-center justify-center w-full border-2 border-dashed border-gray-300 rounded-xl p-14 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all group">
          <div className="text-5xl mb-3 group-hover:scale-110 transition-transform">📖</div>
          <p className="font-semibold text-gray-700">Create a new Web Story</p>
          <p className="text-sm text-gray-500 mt-1">Build slide-by-slide visual stories for your audience</p>
        </button>
      )}

      {/* PREVIEW */}
      {phase === "preview" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-3">
            <p className="font-semibold text-indigo-800 text-sm">
              👁 Story Preview — <span className="font-bold">{form.slides.length} slide{form.slides.length !== 1 ? "s" : ""}</span>
            </p>
            <button onClick={handleSubmit} className="bg-indigo-600 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-indigo-700 transition">
              🚀 {editingId ? "Update" : "Publish"}
            </button>
          </div>
          <StoryPreview story={form} />
        </div>
      )}

      {/* EDITING */}
      {phase === "editing" && (
        <div className="space-y-5">
          {/* Tabs */}
          <div className="flex gap-0 border-b overflow-x-auto">
            {TABS.map(([key, lbl]) => (
              <button key={key} onClick={() => setTab(key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap ${
                  tab === key ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"
                }`}>
                {lbl}
              </button>
            ))}
          </div>

          {/* SLIDES TAB */}
          {tab === "slides" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Slide list */}
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-black uppercase tracking-widest text-gray-400">Slides</p>
                  <button onClick={addSlide}
                    className="text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1 rounded-lg transition">
                    + Add Slide
                  </button>
                </div>
                {form.slides.map((s, i) => (
                  <div key={s.id} role="button" tabIndex={0}
                    onClick={() => setActiveSlide(i)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveSlide(i); } }}
                    className={`w-full cursor-pointer text-left flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition ${
                      i === activeSlide ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white hover:border-gray-300"
                    }`}>
                    {s.image ? (
                      <div className="w-10 h-14 rounded overflow-hidden flex-shrink-0 bg-gray-100 relative">
                        <Image src={s.image} alt="" fill className="object-cover" />
                      </div>
                    ) : (
                      <div className="w-10 h-14 rounded flex-shrink-0 bg-gray-100 flex items-center justify-center text-xs text-gray-400">{i + 1}</div>
                    )}
                    <div className="min-w-0">
                      <p className={`text-xs font-bold truncate ${i === activeSlide ? "text-indigo-700" : "text-gray-700"}`}>
                        {s.heading || `Slide ${i + 1}`}
                      </p>
                      <p className="text-[10px] text-gray-400 truncate">{s.body || "No text yet"}</p>
                    </div>
                    <div className="ml-auto flex flex-col gap-0.5">
                      <button onClick={(e) => { e.stopPropagation(); moveSlide(i, -1); }}
                        disabled={i === 0}
                        className="text-gray-300 hover:text-gray-600 disabled:opacity-20 text-xs leading-none">▲</button>
                      <button onClick={(e) => { e.stopPropagation(); moveSlide(i, 1); }}
                        disabled={i === form.slides.length - 1}
                        className="text-gray-300 hover:text-gray-600 disabled:opacity-20 text-xs leading-none">▼</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Slide editor */}
              <div className="lg:col-span-2 space-y-4">
                {slide && (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-gray-700">Slide {activeSlide + 1} of {form.slides.length}</p>
                      {form.slides.length > 1 && (
                        <button onClick={() => removeSlide(activeSlide)}
                          className="text-xs text-red-500 hover:text-red-700 underline">Remove slide</button>
                      )}
                    </div>

                    <Field label="Slide Heading">
                      <input value={slide.heading} onChange={(e) => setSlide(activeSlide, "heading", e.target.value)}
                        placeholder="Slide headline" className="input" />
                    </Field>

                    <Field label="Slide Body">
                      <textarea rows={4} value={slide.body} onChange={(e) => setSlide(activeSlide, "body", e.target.value)}
                        placeholder="Slide text / caption" className="input" />
                    </Field>

                    <Field label="Slide Image">
                      <input type="file" accept="image/*" onChange={(e) => handleSlideImageUpload(e, activeSlide)} className="text-sm" />
                      {slide.image && (
                        <div className="mt-2 relative w-40 h-56 rounded-lg overflow-hidden border bg-gray-100">
                          <Image src={slide.image} alt="Slide" fill className="object-cover" />
                        </div>
                      )}
                    </Field>

                    {slide.image && (
                      <Field label="Image Alt Text">
                        <input value={slide.alt || ""} onChange={(e) => setSlide(activeSlide, "alt", e.target.value)}
                          placeholder="Describe the image (for accessibility & SEO)" className="input text-sm" />
                      </Field>
                    )}

                    <div className="border rounded-xl p-4 bg-gray-50 space-y-3">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Call to Action (optional)</p>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Button Label">
                          <input value={slide.cta?.label || ""} onChange={(e) => setSlideCta(activeSlide, "label", e.target.value)}
                            placeholder="e.g. Read More" className="input text-sm" />
                        </Field>
                        <Field label="Button URL">
                          <input value={slide.cta?.url || ""} onChange={(e) => setSlideCta(activeSlide, "url", e.target.value)}
                            placeholder="https://..." className="input text-sm" />
                        </Field>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* DETAILS TAB */}
          {tab === "details" && (
            <div className="space-y-4">
              <Field label="Story Title" required>
                <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Enter story title" className="input" />
              </Field>
              <Field label="Slug">
                <input value={form.slug} onChange={(e) => set("slug", e.target.value)} className="input font-mono text-sm text-gray-500" />
              </Field>
              <Field label="Excerpt">
                <textarea rows={3} value={form.excerpt} onChange={(e) => set("excerpt", e.target.value)}
                  placeholder="Short description shown in listings" className="input" />
              </Field>
              <Field label="Thumbnail Image">
                <input type="file" accept="image/*" onChange={handleThumbnailUpload} className="text-sm" />
                {form.thumbnail && (
                  <div className="mt-2 relative w-40 h-56 rounded-lg overflow-hidden border bg-gray-100">
                    <Image src={form.thumbnail} alt="Thumbnail" fill className="object-cover" />
                  </div>
                )}
              </Field>
            </div>
          )}

          {/* TARGETING & SEO TAB */}
          {tab === "targeting" && (
            <div className="space-y-6">
              <Field label="Short Description">
                <textarea rows={2} value={form.shortDescription} onChange={(e) => set("shortDescription", e.target.value)}
                  placeholder="One-line summary used on related-story cards and meta description" className="input" />
              </Field>

              <Field label="Poster Image (portrait, ≥ 640×853)">
                <p className="text-xs text-gray-400 mb-1.5">Required by Google for Discover / Visual Stories. Use a tall 3:4 image.</p>
                <input type="file" accept="image/*" onChange={handlePosterUpload} className="text-sm" />
                {form.posterImage && (
                  <div className="mt-2 relative w-40 h-56 rounded-lg overflow-hidden border bg-gray-100">
                    <Image src={form.posterImage} alt="Poster" fill className="object-cover" />
                  </div>
                )}
              </Field>

              <ChipPicker label="Service Categories" options={SERVICE_CATEGORIES} selected={form.serviceCategories}
                onToggle={(v) => toggleInArray("serviceCategories", v)} onAddOther={(v) => addCustomToArray("serviceCategories", v)} />

              <ChipPicker label="Locations (optional)" options={LOCATIONS} selected={form.locations}
                onToggle={(v) => toggleInArray("locations", v)} onAddOther={(v) => addCustomToArray("locations", v)} />

              <Field label="Tags (comma-separated)">
                <input
                  value={(form.tags || []).join(", ")}
                  onChange={(e) => set("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))}
                  placeholder="e.g. stain-removal, monsoon, pet-safe" className="input" />
              </Field>

              <Field label="Priority">
                <p className="text-xs text-gray-400 mb-1.5">Higher numbers surface first in related sections and the homepage row.</p>
                <input type="number" value={form.priority}
                  onChange={(e) => set("priority", Number(e.target.value) || 0)} className="input w-32" />
              </Field>
            </div>
          )}

          {/* Advisory SEO checklist — never blocks publishing */}
          {seoWarnings.length > 0 && (
            <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-widest text-amber-700">SEO suggestions ({seoWarnings.length})</p>
              <ul className="space-y-1">
                {seoWarnings.map((w, i) => (
                  <li key={i} className="text-xs text-amber-800 flex gap-2"><span aria-hidden>⚠️</span><span>{w.msg}</span></li>
                ))}
              </ul>
              <p className="text-[11px] text-amber-600 pt-1">These are suggestions only — you can still publish.</p>
            </div>
          )}

          {/* Save bar */}
          <div className="flex items-center gap-3 pt-2 flex-wrap border-t pt-5">
            <select value={form.status} onChange={(e) => set("status", e.target.value)} className="input w-auto">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
            <button onClick={handleSubmit} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-3 rounded-lg transition min-w-[140px]">
              {editingId ? "Update Story" : "Publish Story"}
            </button>
          </div>
        </div>
      )}

      {/* Stories table */}
      <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold text-gray-800">All Web Stories — {brandConfig?.name}</h2>
          <div className="flex gap-2 items-center">
            {selected.length > 0 && (
              <button onClick={() => deleteStories(selected)} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium">
                Delete ({selected.length})
              </button>
            )}
            <button onClick={() => { setForm(emptyForm()); setPhase("editing"); setActiveSlide(0); }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition">
              + New Story
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="p-3 w-8"></th>
                <th className="p-3 text-left">Title</th>
                <th className="p-3 text-left">Slides</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {stories.length === 0 && (
                <tr><td colSpan={5} className="py-12 text-center text-gray-500 text-sm">No stories yet. Create your first Web Story above.</td></tr>
              )}
              {stories.map((story) => (
                <tr key={story.id} className="border-t hover:bg-gray-50 transition">
                  <td className="p-3">
                    <input type="checkbox" checked={selected.includes(story.id)}
                      onChange={() => setSelected((p) => p.includes(story.id) ? p.filter((x) => x !== story.id) : [...p, story.id])} />
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      {story.thumbnail ? (
                        <div className="relative w-8 h-11 rounded overflow-hidden flex-shrink-0 bg-gray-100">
                          <Image src={story.thumbnail} alt="" fill className="object-cover" />
                        </div>
                      ) : (
                        <div className="w-8 h-11 rounded flex-shrink-0 bg-gray-100 flex items-center justify-center text-xs">📖</div>
                      )}
                      <span className="font-medium text-gray-800 truncate max-w-[180px]">{story.title}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full border border-purple-100">
                      {story.slides?.length ?? 0} slides
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${story.status === "published" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                      {story.status}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1.5 justify-center">
                      <button onClick={() => handleEdit(story)} className="bg-orange-100 hover:bg-orange-200 text-orange-600 px-3 py-1 rounded text-xs font-medium">Edit</button>
                      <button onClick={() => deleteStories([story.id])} className="bg-red-100 hover:bg-red-200 text-red-600 px-3 py-1 rounded text-xs font-medium">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StoryPreview({ story }) {
  const [current, setCurrent] = useState(0);
  const slides = story.slides || [];
  if (slides.length === 0) return <p className="text-center text-gray-500 py-10">No slides to preview.</p>;

  const slide = slides[current];
  return (
    <div className="flex flex-col items-center gap-4">
      {/* Phone frame */}
      <div className="relative w-72 h-[500px] rounded-3xl overflow-hidden border-4 border-slate-800 shadow-2xl bg-black">
        {slide.image ? (
          <Image src={slide.image} alt="" fill className="object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 to-slate-900" />
        )}
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />

        {/* Progress bars */}
        <div className="absolute top-3 left-3 right-3 flex gap-1">
          {slides.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden">
              <div className={`h-full bg-white transition-all ${i < current ? "w-full" : i === current ? "w-full" : "w-0"}`} />
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="absolute bottom-0 left-0 right-0 p-5 space-y-2">
          {slide.heading && <p className="text-white font-bold text-lg leading-tight">{slide.heading}</p>}
          {slide.body    && <p className="text-white/80 text-sm leading-snug">{slide.body}</p>}
          {slide.cta?.label && slide.cta?.url && (
            <span className="inline-block mt-2 bg-white text-slate-900 text-xs font-bold px-4 py-2 rounded-full">
              {slide.cta.label}
            </span>
          )}
        </div>

        {/* Tap zones */}
        <button onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          className="absolute left-0 top-0 bottom-0 w-1/3" aria-label="Previous slide" />
        <button onClick={() => setCurrent((c) => Math.min(slides.length - 1, c + 1))}
          className="absolute right-0 top-0 bottom-0 w-1/3" aria-label="Next slide" />
      </div>

      {/* Slide counter + nav */}
      <div className="flex items-center gap-3 text-sm text-gray-600">
        <button onClick={() => setCurrent((c) => Math.max(0, c - 1))} disabled={current === 0}
          className="px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition">←</button>
        <span>{current + 1} / {slides.length}</span>
        <button onClick={() => setCurrent((c) => Math.min(slides.length - 1, c + 1))} disabled={current === slides.length - 1}
          className="px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition">→</button>
      </div>
    </div>
  );
}

function EyeIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M1 10C2.5 5.5 6 3 10 3s7.5 2.5 9 7c-1.5 4.5-5 7-9 7S2.5 14.5 1 10z" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function Field({ label, required, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label} {required && <span className="text-red-400">*</span>}</label>
      {children}
      {hint && <p className="text-xs mt-1 text-gray-500">{hint}</p>}
    </div>
  );
}

// Multi-select chip picker with a free-text "other" input. `options` are the
// canonical taxonomy entries; `selected` is an array of slugs (may include
// custom slugs that aren't in `options`).
function ChipPicker({ label, options, selected, onToggle, onAddOther }) {
  const [other, setOther] = useState("");
  const known = new Set(options.map((o) => o.slug));
  const custom = (selected || []).filter((s) => !known.has(s));

  const submitOther = () => { onAddOther(other); setOther(""); };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected?.includes(o.slug);
          return (
            <button key={o.slug} type="button" onClick={() => onToggle(o.slug)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                on ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-gray-300 text-gray-600 hover:border-indigo-400"
              }`}>
              {o.label}
            </button>
          );
        })}
        {custom.map((slug) => (
          <button key={slug} type="button" onClick={() => onToggle(slug)}
            className="px-3 py-1.5 rounded-full text-xs font-medium border bg-indigo-600 border-indigo-600 text-white">
            {slug} ✕
          </button>
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        <input value={other} onChange={(e) => setOther(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitOther(); } }}
          placeholder="Add other…" className="input text-sm flex-1" />
        <button type="button" onClick={submitOther}
          className="text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 rounded-lg transition">
          Add
        </button>
      </div>
    </div>
  );
}

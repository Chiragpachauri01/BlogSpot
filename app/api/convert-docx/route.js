/**
 * app/api/convert-docx/route.js
 *
 * Converts .docx → clean semantic HTML by parsing raw OOXML directly.
 *
 * INLINE IMAGE FIX:
 * Word stores images in two ways:
 *   1. wp:inline  — image sits inline with text (most common)
 *   2. wp:anchor  — image is floating/anchored
 *
 * Both live inside <w:drawing> inside <w:r> (a run).
 * The image data lives in word/media/ and is referenced via:
 *   <a:blip r:embed="rId5"/>  ← rId5 maps to media/image1.png via rels file
 *
 * Previous bug: we assigned UUIDs per-relationship upfront, but then looked up
 * by rId at render time — if the rels parse happened after UUID assignment the
 * lookup missed. Now we do ONE pass: parse rels → build rId→{buffer,mimeType}
 * map → at render time each <w:drawing> gets a fresh UUID stored in imageMap.
 * The client receives imageMap and replaces UUID srcs with real Firebase URLs.
 *
 * INSTALL: npm install unzipper xml2js uuid
 */

import { NextResponse } from "next/server";
import unzipper from "unzipper";
import { parseStringPromise } from "xml2js";
import { v4 as uuidv4 } from "uuid";
import { Readable } from "stream";

export const runtime = "nodejs";

// ─── XML parse options ────────────────────────────────────────────────────────
const XML_OPTS = {
  explicitArray: true,
  explicitCharkey: true,
  charkey: "_",
  attrkey: "$",
  explicitChildren: true,
  childkey: "$$",
  charsAsChildren: false,
  preserveChildrenOrder: true,
  tagNameProcessors: [],
};

// ─── Theme fallback colors ────────────────────────────────────────────────────
const THEME_DEFAULTS = {
  dk1: "000000", lt1: "FFFFFF", dk2: "1F3864", lt2: "E7E6E6",
  accent1: "4472C4", accent2: "ED7D31", accent3: "A9D18E",
  accent4: "FFC000", accent5: "5B9BD5", accent6: "70AD47",
  hlink: "0563C1", folHlink: "954F72",
};

// ─── Utilities ────────────────────────────────────────────────────────────────
const hpToPx = (hp) => Math.round((parseInt(hp, 10) / 2) * (96 / 72));
const hexColor = (v) => (v && /^[0-9A-Fa-f]{6}$/.test(v)) ? `#${v.toUpperCase()}` : null;

function extractThemeColors(xml) {
  const colors = { ...THEME_DEFAULTS };
  try {
    const scheme = xml?.["a:theme"]?.["a:themeElements"]?.[0]?.["a:clrScheme"]?.[0];
    if (!scheme) return colors;
    for (const slot of Object.keys(THEME_DEFAULTS)) {
      const n = scheme[`a:${slot}`]?.[0];
      if (!n) continue;
      const v = n["a:srgbClr"]?.[0]?.$?.val || n["a:sysClr"]?.[0]?.$?.lastClr;
      if (v) colors[slot] = v;
    }
  } catch { }
  return colors;
}

// ─── Style map: named styleId → {rPr, pPr} ───────────────────────────────────
function extractStyleMap(xml) {
  const map = {};
  for (const s of (xml?.["w:styles"]?.["w:style"] || [])) {
    const id = s?.$?.["w:styleId"];
    if (id) map[id] = { rPr: s?.["w:rPr"]?.[0] || {}, pPr: s?.["w:pPr"]?.[0] || {} };
  }
  return map;
}

// ─── Relationships ────────────────────────────────────────────────────────────
async function parseRels(buf) {
  const xml = await parseStringPromise(buf.toString("utf8"));
  const out = {};
  for (const r of (xml?.Relationships?.Relationship || [])) {
    const id = r?.$?.Id;
    const tgt = r?.$?.Target || "";
    const type = r?.$?.Type || "";
    if (id) out[id] = { target: tgt, isImage: type.includes("/image") };
  }
  return out;
}

// ─── Read zip entries ─────────────────────────────────────────────────────────
async function readDocx(buffer) {
  const files = {};
  const zip = Readable.from(buffer).pipe(unzipper.Parse({ forceStream: true }));
  for await (const entry of zip) {
    const p = entry.path;
    const chunks = [];
    for await (const chunk of entry) chunks.push(chunk);
    if (
      p === "word/document.xml" ||
      p === "word/styles.xml" ||
      p === "word/numbering.xml" ||
      p === "word/theme/theme1.xml" ||
      p === "word/_rels/document.xml.rels" ||
      p.startsWith("word/media/")
    ) {
      files[p] = Buffer.concat(chunks);
    }
  }
  return files;
}

// ─── Build run-level inline style ────────────────────────────────────────────
function buildRunStyle(rPr, themeColors) {
  const parts = [];

  // Font family
  const ff = rPr?.["w:rFonts"]?.[0]?.$;
  const font = ff?.["w:ascii"] || ff?.["w:hAnsi"];
  if (font && !["Times New Roman", "Calibri", "Arial"].includes(font))
    parts.push(`font-family:'${font}',serif`);

  // Font size (half-points → px)
  const sz = rPr?.["w:sz"]?.[0]?.$?.["w:val"];
  if (sz) {
    const px = hpToPx(sz);
    if (px !== 16) parts.push(`font-size:${px}px`);
  }

  // Text color
  const colorVal = rPr?.["w:color"]?.[0]?.$?.["w:val"];
  const themeSlot = rPr?.["w:color"]?.[0]?.$?.["w:themeColor"];
  let color = hexColor(colorVal);
  if (!color && themeSlot) color = hexColor(themeColors[themeSlot]);
  if (color && color !== "#000000") parts.push(`color:${color}`);

  // Background / highlight
  const hl = rPr?.["w:highlight"]?.[0]?.$?.["w:val"];
  const HLMAP = {
    yellow: "#FFFF00", green: "#00FF00", cyan: "#00FFFF", magenta: "#FF00FF",
    blue: "#0000FF", red: "#FF0000", darkBlue: "#00008B", darkCyan: "#008B8B",
    darkGreen: "#006400", darkMagenta: "#8B008B", darkRed: "#8B0000",
    darkYellow: "#808000", darkGray: "#A9A9A9", lightGray: "#D3D3D3",
  };
  if (hl && HLMAP[hl]) parts.push(`background-color:${HLMAP[hl]}`);

  const shdFill = rPr?.["w:shd"]?.[0]?.$?.["w:fill"];
  if (shdFill && shdFill !== "auto" && shdFill !== "FFFFFF")
    parts.push(`background-color:#${shdFill}`);

  return parts.join(";");
}

// ─── Paragraph alignment ─────────────────────────────────────────────────────
function getAlign(pPr) {
  const v = pPr?.["w:jc"]?.[0]?.$?.["w:val"];
  return { center: "center", right: "right", both: "justify", distribute: "justify" }[v] || null;
}

// ─── Heading tag from style id ────────────────────────────────────────────────
const HEADING_MAP = {
  "Heading1": "h2",   // 🔥 changed
  "Heading2": "h2",
  "Heading3": "h3",
  "Heading4": "h4",
  "Heading5": "h5",
  "Heading6": "h6",

  "heading1": "h2",   // 🔥 changed
  "heading2": "h2",
  "heading3": "h3",

  "Title": "h2",      // 🔥 changed
  "Subtitle": "h3"
};
const QUOTE_STYLES = new Set(["Quote", "IntenseQuote", "BlockText"]);
function getTag(styleId) {
  const norm = (styleId || "").replace(/\s/g, "");
  return HEADING_MAP[norm] || HEADING_MAP[styleId] || "p";
}
function removeFirstHeading(html) {
  return html.replace(/<(h1|h2|h3)[^>]*>.*?<\/\1>/i, "");
}
// ─── Extract image embed rId from a w:drawing node ───────────────────────────
function extractDrawingRid(drawing) {
  for (const wrapKey of ["wp:inline", "wp:anchor"]) {
    const wrap = drawing?.[wrapKey]?.[0];
    if (!wrap) continue;
    const blip =
      wrap?.["a:graphic"]?.[0]
        ?.["a:graphicData"]?.[0]
        ?.["pic:pic"]?.[0]
        ?.["pic:blipFill"]?.[0]
        ?.["a:blip"]?.[0]?.$?.["r:embed"];
    if (!blip) continue;
    // wp:docPr carries the alt text the author typed in Word
    const docPr = wrap?.["wp:docPr"]?.[0]?.$;
    const alt = docPr?.descr || docPr?.title || "";
    return { rId: blip, alt };
  }
  return null;
}

// ─── Process a single run ─────────────────────────────────────────────────────
function processRun(run, rPrBase, themeColors, mediaMap, imageMap) {
  const rPr = run?.["w:rPr"]?.[0] || {};
  const merged = { ...rPrBase, ...rPr };

  // ── IMAGE ── w:drawing lives inside a run
  const drawing = run?.["w:drawing"]?.[0];
  if (drawing) {
    const info = extractDrawingRid(drawing);
    if (info && mediaMap[info.rId]) {
      const { base64, mimeType } = mediaMap[info.rId];
      const uuid = uuidv4();
      imageMap[uuid] = { base64, mimeType };
      const safeAlt = (info.alt || "").replace(/"/g, "&quot;");
      return `<figure class="blog-figure"><img src="${uuid}" alt="${safeAlt}" loading="lazy"></figure>`;
    }
    return "";
  }

  // ── TEXT ──
  const textNodes = run?.["w:t"] || [];
  let text = textNodes.map(t => typeof t === "string" ? t : (t?._ || "")).join("");
  if (!text) return "";

  // Escape HTML
  text = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  // Preserve leading/trailing spaces
  text = text.replace(/ {2,}/g, m => "&nbsp;".repeat(m.length));

  // Run-level formatting (semantic tags first)
  const isBold = merged?.["w:b"]?.length > 0 && merged?.["w:b"]?.[0]?.$?.["w:val"] !== "0";
  const isItalic = merged?.["w:i"]?.length > 0 && merged?.["w:i"]?.[0]?.$?.["w:val"] !== "0";
  const isUnder = merged?.["w:u"]?.[0]?.$?.["w:val"] && merged?.["w:u"]?.[0]?.$?.["w:val"] !== "none";
  const isStrike = merged?.["w:strike"]?.length > 0 && merged?.["w:strike"]?.[0]?.$?.["w:val"] !== "0";
  const isSuper = merged?.["w:vertAlign"]?.[0]?.$?.["w:val"] === "superscript";
  const isSub = merged?.["w:vertAlign"]?.[0]?.$?.["w:val"] === "subscript";
  const isCode = (merged?.["w:rStyle"]?.[0]?.$?.["w:val"] || "").toLowerCase().includes("code");

  let html = text;
  if (isCode) html = `<code>${html}</code>`;
  if (isSuper) html = `<sup>${html}</sup>`;
  if (isSub) html = `<sub>${html}</sub>`;
  if (isStrike) html = `<s>${html}</s>`;
  if (isUnder) html = `<u>${html}</u>`;
  if (isItalic) html = `<em>${html}</em>`;
  if (isBold) html = `<strong>${html}</strong>`;

  const style = buildRunStyle(merged, themeColors);
  if (style) html = `<span style="${style}">${html}</span>`;

  return html;
}

// ─── Process a paragraph ──────────────────────────────────────────────────────
function processParagraph(para, styleMap, themeColors, mediaMap, imageMap) {
  const pPr = para?.["w:pPr"]?.[0] || {};
  const styleId = pPr?.["w:pStyle"]?.[0]?.$?.["w:val"] || "";
  const numPr = pPr?.["w:numPr"]?.[0];
  const tag = getTag(styleId);
  const align = getAlign(pPr);
  const isQuote = QUOTE_STYLES.has(styleId);

  // Indentation from list/paragraph
  const indLeft = pPr?.["w:ind"]?.[0]?.$?.["w:left"];
  const indent = indLeft ? Math.round(parseInt(indLeft, 10) / 914) * 10 : 0;

  // Merge style→para→run rPr
  const styleRPr = styleMap[styleId]?.rPr || {};
  const paraRPr = pPr?.["w:rPr"]?.[0] || {};
  const rPrBase = { ...styleRPr, ...paraRPr };

  // Build inner HTML by walking ordered children ($$)
  let inner = "";
  const kids = para?.$$ || [];

  for (const child of kids) {
    const name = child["#name"];
    if (name === "w:r") {
      inner += processRun(child, rPrBase, themeColors, mediaMap, imageMap);
    } else if (name === "w:hyperlink") {
      const rId = child?.$?.["r:id"];
      // Build href: external URL from rels, or anchor from w:anchor attr
      const anchor = child?.$?.["w:anchor"];
      const relUrl = rId ? (/* will be resolved by caller */ rId) : null;
      const hRuns = child?.["w:r"] || [];
      const hText = hRuns.map(r => processRun(r, rPrBase, themeColors, mediaMap, imageMap)).join("");
      if (hText) {
        // Store rId; caller will swap for URL post-parse
        const href = anchor ? `#${anchor}` : (relUrl ? `__REL_${relUrl}__` : "#");
        inner += `<a href="${href}" rel="noopener noreferrer">${hText}</a>`;
      }
    } else if (name === "w:br") {
      const t = child?.$?.["w:type"];
      if (!t || t === "textWrapping") inner += "<br>";
    }
  }

  if (!inner.trim() && !inner.includes("<figure")) return "";

  // If paragraph only contains a figure, return figure directly (no wrapping p)
  const trimmed = inner.trim();
  if (trimmed.startsWith("<figure") && trimmed.endsWith("</figure>")) {
    return trimmed;
  }

  // Build paragraph style
  const styleParts = [];
  if (align) styleParts.push(`text-align:${align}`);
  if (indent) styleParts.push(`margin-left:${indent}px`);
  const styleAttr = styleParts.length ? ` style="${styleParts.join(";")}"` : "";

  if (numPr) return `<li${styleAttr}>${inner}</li>`;
  if (isQuote) return `<blockquote${styleAttr}>${inner}</blockquote>`;
  return `<${tag}${styleAttr}>${inner}</${tag}>`;
}

// ─── Process table ────────────────────────────────────────────────────────────
function processTable(tbl, styleMap, themeColors, mediaMap, imageMap) {
  const rows = (tbl?.["w:tr"] || []).map(row => {
    const cells = (row?.["w:tc"] || []).map(cell => {
      const content = (cell?.["w:p"] || [])
        .map(p => processParagraph(p, styleMap, themeColors, mediaMap, imageMap))
        .join("");
      const shd = cell?.["w:tcPr"]?.[0]?.["w:shd"]?.[0]?.$?.["w:fill"];
      const bg = (shd && shd !== "auto" && shd !== "FFFFFF") ? ` style="background-color:#${shd}"` : "";
      return `<td${bg}>${content || "&nbsp;"}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  return `<div class="table-wrapper"><table><tbody>${rows}</tbody></table></div>`;
}

// ─── Process document body ────────────────────────────────────────────────────
function processBody(body, styleMap, themeColors, mediaMap, imageMap) {
  const elements = body?.$$ || [];
  const out = [];
  let listBuf = [];
  let listTag = null;

  const flush = () => {
    if (!listBuf.length) return;
    out.push(`<${listTag}>${listBuf.join("")}</${listTag}>`);
    listBuf = []; listTag = null;
  };

  for (const el of elements) {
    if (el["#name"] === "w:p") {
      const numPr = el?.["w:pPr"]?.[0]?.["w:numPr"]?.[0];
      const html = processParagraph(el, styleMap, themeColors, mediaMap, imageMap);
      if (!html) { flush(); continue; }
      if (numPr) {
        if (!listTag) listTag = "ul";
        listBuf.push(html);
      } else {
        flush();
        out.push(html);
      }
    } else if (el["#name"] === "w:tbl") {
      flush();
      out.push(processTable(el, styleMap, themeColors, mediaMap, imageMap));
    }
  }
  flush();
  return out.join("\n");
}

// ─── Final HTML cleanup ───────────────────────────────────────────────────────
function cleanHtml(html, rels) {
  // Resolve hyperlink rel placeholders → real URLs
  html = html.replace(/__REL_(rId\d+)__/g, (_, rId) => {
    const r = rels[rId];
    return (r && !r.isImage) ? r.target : "#";
  });

  // Strip mso-* junk
  html = html.replace(/mso-[^;}"']+;?\s*/gi, "");
  // Strip empty style attrs
  html = html.replace(/\s*style="\s*"/gi, "");
  // Remove bare empty tags
  html = html.replace(/<(p|li|h[1-6])(\s[^>]*)?>(\s|&nbsp;)*<\/\1>/gi, "");
  // Normalize whitespace between tags
  html = html.replace(/>\s{2,}</g, ">\n<");
  return html.trim();
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const fd = await request.formData();
    const file = fd.get("file");
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());

    // 1. Read zip
    const files = await readDocx(buffer);
    if (!files["word/document.xml"])
      return NextResponse.json({ error: "Invalid .docx" }, { status: 400 });

    // 2. Parse XML in parallel
    const [docXml, stylesXml, themeXml, rels] = await Promise.all([
      parseStringPromise(files["word/document.xml"].toString("utf8"), XML_OPTS),
      files["word/styles.xml"]
        ? parseStringPromise(files["word/styles.xml"].toString("utf8"), XML_OPTS)
        : null,
      files["word/theme/theme1.xml"]
        ? parseStringPromise(files["word/theme/theme1.xml"].toString("utf8"), XML_OPTS)
        : null,
      files["word/_rels/document.xml.rels"]
        ? parseRels(files["word/_rels/document.xml.rels"])
        : {},
    ]);

    const themeColors = extractThemeColors(themeXml);
    const styleMap = extractStyleMap(stylesXml);

    // 3. Build mediaMap: rId → { base64, mimeType }
    //    Key insight: resolve BEFORE walking document so every drawing lookup works
    const mediaMap = {};
    for (const [rId, rel] of Object.entries(rels)) {
      if (!rel.isImage) continue;
      // rel.target is like "../media/image1.png" or "media/image1.png"
      const filename = rel.target.replace(/^\.\.\//, "").replace(/^media\//, "");
      const mediaPath = `word/media/${filename}`;
      const buf = files[mediaPath];
      if (!buf) continue;
      const ext = filename.split(".").pop()?.toLowerCase() || "png";
      const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
      mediaMap[rId] = { base64: buf.toString("base64"), mimeType: mime };
    }

    // 4. Walk document — imageMap gets populated as we encounter drawings
    const imageMap = {}; // uuid → { base64, mimeType }
    const body =
      docXml?.["w:document"]?.["w:body"]?.[0] ||
      docXml?.["w:document"]?.[0]?.["w:body"]?.[0];

    if (!body) return NextResponse.json({ error: "No document body" }, { status: 400 });

    const rawHtml = processBody(body, styleMap, themeColors, mediaMap, imageMap);
    const html = cleanHtml(rawHtml, rels);

    return NextResponse.json({ html, imageMap });
  } catch (err) {
    console.error("[convert-docx]", err);
    return NextResponse.json({ error: err.message || "Conversion failed" }, { status: 500 });
  }
}
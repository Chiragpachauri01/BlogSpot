/**
 * lib/webstoryTaxonomy.js
 *
 * Canonical vocabulary used to tag Web Stories so the public sites can show
 * "Related Web Stories" on the right service / location / blog pages.
 *
 * These slugs MUST match what the brand sites filter on (e.g. a service page
 * for "sofa-cleaning" asks for stories whose serviceCategories include
 * "sofa-cleaning"). The admin form lets the SEO author pick from these AND add
 * a custom "other" value, so the list can grow without a code change — but keep
 * new common values here so they appear as one-click chips.
 */

export const SERVICE_CATEGORIES = [
  { slug: "sofa-cleaning",       label: "Sofa Cleaning" },
  { slug: "kitchen-cleaning",    label: "Kitchen Cleaning" },
  { slug: "carpet-cleaning",     label: "Carpet Cleaning" },
  { slug: "home-deep-cleaning",  label: "Home Deep Cleaning" },
  { slug: "office-cleaning",     label: "Office Cleaning" },
];

export const LOCATIONS = [
  { slug: "delhi",         label: "Delhi" },
  { slug: "noida",         label: "Noida" },
  { slug: "gurgaon",       label: "Gurgaon" },
  { slug: "faridabad",     label: "Faridabad" },
  { slug: "greater-noida", label: "Greater Noida" },
];

/** Normalize free-text "other" input into a slug consistent with the lists. */
export const toSlug = (t) =>
  (t || "").toLowerCase().trim().replace(/[^a-z0-9 -]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");

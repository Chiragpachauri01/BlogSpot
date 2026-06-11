export const BRANDS = [
  {
    id:        "quick-cleaning",
    name:      "Quick Cleaning Services",
    shortName: "Quick Cleaning",
    logoText:  "QC",
    siteUrl:   process.env.QC_SITE_URL   || "https://quickcleaningservices.in",
    revalidateSecret: process.env.QC_REVALIDATE_SECRET  || process.env.REVALIDATE_SECRET || "",
    dot:       "bg-emerald-400",
    badge:     "bg-emerald-100 text-emerald-700",
    active:    "bg-emerald-600 text-white",
    hover:     "hover:bg-white/10",
    accent:    "emerald",
  },
  {
    id:        "shark-web-digital",
    name:      "Shark Web Digital",
    shortName: "Shark Web",
    logoText:  "SWD",
    siteUrl:   process.env.SWD_SITE_URL  || "https://sharkwebdigital.com",
    revalidateSecret: process.env.SWD_REVALIDATE_SECRET || process.env.REVALIDATE_SECRET || "",
    dot:       "bg-blue-400",
    badge:     "bg-blue-100 text-blue-700",
    active:    "bg-blue-600 text-white",
    hover:     "hover:bg-white/10",
    accent:    "blue",
  },
  {
    id:        "dryclean-master",
    name:      "Dryclean Master",
    shortName: "Dryclean Master",
    logoText:  "DCM",
    siteUrl:   process.env.DCM_SITE_URL  || "https://drycleanmaster.in",
    revalidateSecret: process.env.DCM_REVALIDATE_SECRET || process.env.REVALIDATE_SECRET || "",
    dot:       "bg-violet-400",
    badge:     "bg-violet-100 text-violet-700",
    active:    "bg-violet-600 text-white",
    hover:     "hover:bg-white/10",
    accent:    "violet",
  },
];

export function getBrand(id) {
  return BRANDS.find((b) => b.id === id) || null;
}

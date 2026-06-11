"use client";

import { useParams, notFound } from "next/navigation";
import AdminShell from "@/components/admin/AdminShell";
import BlogManager from "@/components/admin/blog";
import { getBrand } from "@/lib/brands";

export default function BrandBlogPage() {
  const { brand } = useParams();
  const brandConfig = getBrand(brand);

  if (!brandConfig) return notFound();

  return (
    <AdminShell>
      <BlogManager brand={brand} brandConfig={brandConfig} />
    </AdminShell>
  );
}

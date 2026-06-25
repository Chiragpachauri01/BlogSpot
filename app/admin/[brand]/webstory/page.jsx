"use client";

import { useParams, notFound } from "next/navigation";
import AdminShell from "@/components/admin/AdminShell";
import WebStoryManager from "@/components/admin/webstory";
import { getBrand } from "@/lib/brands";

export default function BrandWebStoryPage() {
  const { brand } = useParams();
  const brandConfig = getBrand(brand);

  if (!brandConfig) return notFound();

  return (
    <AdminShell>
      <WebStoryManager brand={brand} brandConfig={brandConfig} />
    </AdminShell>
  );
}

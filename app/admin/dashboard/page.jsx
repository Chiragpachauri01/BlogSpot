"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, getDocs, query, orderBy, where } from "firebase/firestore";
import { db } from "@/firebase/firebase.config";
import AdminShell from "@/components/admin/AdminShell";
import { BRANDS } from "@/lib/brands";
import { PenLine } from "lucide-react";

export default function Dashboard() {
  const router = useRouter();
  const [counts, setCounts] = useState({});
  const [recents, setRecents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const results = await Promise.all(
          BRANDS.map((b) =>
            getDocs(query(collection(db, "blogs"), where("brand", "==", b.id), orderBy("createdAt", "desc")))
              .then((snap) => ({
                id:    b.id,
                docs:  snap.docs.map((d) => ({ id: d.id, ...d.data(), brandId: b.id })),
              }))
          )
        );

        const c = {};
        const all = [];
        for (const { id, docs } of results) {
          c[id] = { total: docs.length, published: docs.filter((d) => d.status === "published").length };
          all.push(...docs);
        }
        setCounts(c);
        // Sort recents by createdAt descending (Firestore Timestamps)
        all.sort((a, b) => {
          const ta = a.createdAt?.seconds || 0;
          const tb = b.createdAt?.seconds || 0;
          return tb - ta;
        });
        setRecents(all.slice(0, 10));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const totalBlogs     = Object.values(counts).reduce((s, c) => s + (c?.total || 0), 0);
  const totalPublished = Object.values(counts).reduce((s, c) => s + (c?.published || 0), 0);

  return (
    <AdminShell>
      <div className="space-y-8">
        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">All brands at a glance — pick one to start writing</p>
        </div>

        {/* Global summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm col-span-2 sm:col-span-1">
            <p className="text-3xl font-black text-slate-900">{loading ? "—" : totalBlogs}</p>
            <p className="text-sm text-slate-500 mt-1">Total blogs across all brands</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-3xl font-black text-green-600">{loading ? "—" : totalPublished}</p>
            <p className="text-sm text-slate-500 mt-1">Published</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-3xl font-black text-yellow-500">{loading ? "—" : totalBlogs - totalPublished}</p>
            <p className="text-sm text-slate-500 mt-1">Drafts</p>
          </div>
        </div>

        {/* Brand cards */}
        <div>
          <h2 className="text-base font-bold text-slate-800 mb-3">Choose a brand to write</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {BRANDS.map((brand) => {
              const c = counts[brand.id];
              return (
                <div key={brand.id} onClick={() => router.push(`/admin/${brand.id}/blog`)}
                  className="group relative flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer">
                  <div className="flex items-center gap-3">
                    <span className={`w-3 h-3 rounded-full flex-shrink-0 ${brand.dot}`} />
                    <span className="font-bold text-slate-900 text-sm">{brand.name}</span>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <div>
                      <p className="text-2xl font-black text-slate-900">{loading ? "—" : c?.total ?? 0}</p>
                      <p className="text-xs text-slate-500">total</p>
                    </div>
                    <div>
                      <p className="text-2xl font-black text-green-600">{loading ? "—" : c?.published ?? 0}</p>
                      <p className="text-xs text-slate-500">published</p>
                    </div>
                    <div>
                      <p className="text-2xl font-black text-yellow-500">{loading ? "—" : (c?.total ?? 0) - (c?.published ?? 0)}</p>
                      <p className="text-xs text-slate-500">drafts</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 group-hover:underline mt-auto">
                    <PenLine size={12} /> Write for {brand.shortName} →
                  </div>
                  <a href={brand.siteUrl} target="_blank" rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="absolute top-4 right-4 text-[10px] text-slate-400 hover:text-slate-600 hover:underline">
                    View site ↗
                  </a>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent posts across all brands */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-bold text-slate-900">Recent posts (all brands)</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {!loading && recents.length === 0 && (
              <p className="p-6 text-center text-sm text-slate-500">No blogs yet. Pick a brand above to start writing.</p>
            )}
            {recents.map((blog) => {
              const b = BRANDS.find((x) => x.id === blog.brandId);
              return (
                <Link key={blog.id} href={`/admin/${blog.brandId}/blog`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 text-sm truncate">{blog.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${b?.dot}`} />
                      <p className="text-xs text-slate-400">{b?.shortName}</p>
                    </div>
                  </div>
                  <span className={`ml-4 flex-shrink-0 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    blog.status === "published" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                  }`}>{blog.status}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

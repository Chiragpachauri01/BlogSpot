"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/firebase/firebase.auth";
import { LayoutDashboard, LogOut, Menu, X, PenLine, BookOpen } from "lucide-react";
import { BRANDS } from "@/lib/brands";

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const router   = useRouter();

  const logout = async () => {
    await signOut(auth);
    router.push("/admin/login");
  };

  const close = () => setIsOpen(false);

  const activeBrandId   = BRANDS.find((b) => pathname.includes(`/admin/${b.id}/`))?.id;
  const activeSection   = pathname.includes("/webstory") ? "webstory" : "blog";

  return (
    <>
      {/* Mobile header */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-4 shadow-sm backdrop-blur md:hidden">
        <Link href="/admin/dashboard" className="flex items-center gap-2">
          <span className="text-lg font-black text-indigo-700">Blog</span>
          <span className="text-lg font-black text-slate-900">Master</span>
        </Link>
        <button aria-label="Toggle menu" onClick={() => setIsOpen((v) => !v)}
          className="rounded-lg border border-slate-200 p-2 text-slate-700">
          {isOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </header>

      {isOpen && (
        <button aria-label="Close overlay"
          className="fixed inset-0 z-30 bg-slate-950/40 md:hidden"
          onClick={close} />
      )}

      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-900 p-4 text-white shadow-2xl transition-transform duration-300 md:sticky md:top-0 md:h-screen md:translate-x-0 ${isOpen ? "translate-x-0" : "-translate-x-full"}`}>

        {/* Logo */}
        <div className="flex items-center justify-between rounded-xl bg-white/10 px-4 py-3 mb-6">
          <Link href="/admin/dashboard" onClick={close}>
            <p className="text-base font-black leading-tight">
              <span className="text-indigo-400">Blog</span>Master
            </p>
            <p className="text-xs text-slate-400 mt-0.5">Centralized CMS</p>
          </Link>
          <button onClick={close} className="md:hidden rounded-lg p-1.5 text-slate-400 hover:bg-white/10">
            <X size={16} />
          </button>
        </div>

        {/* Dashboard link */}
        <nav className="space-y-1 text-sm font-semibold">
          <Link href="/admin/dashboard" onClick={close}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
              pathname === "/admin/dashboard"
                ? "bg-white text-slate-900"
                : "text-slate-300 hover:bg-white/10"
            }`}>
            <LayoutDashboard size={16} />
            <span>Dashboard</span>
          </Link>
        </nav>

        {/* Blog brand links */}
        <div className="mt-6">
          <p className="px-3 text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Blogs</p>
          <nav className="space-y-1 text-sm font-semibold">
            {BRANDS.map((brand) => {
              const isActive = activeBrandId === brand.id && activeSection === "blog";
              return (
                <Link key={brand.id} href={`/admin/${brand.id}/blog`} onClick={close}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
                    isActive ? "bg-white text-slate-900" : "text-slate-300 hover:bg-white/10"
                  }`}>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${brand.dot}`} />
                  <span>{brand.shortName}</span>
                  <span className={`ml-auto text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                    isActive ? brand.badge : "opacity-0"
                  }`}>{brand.logoText}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Web Stories brand links */}
        <div className="mt-6">
          <p className="px-3 text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Web Stories</p>
          <nav className="space-y-1 text-sm font-semibold">
            {BRANDS.map((brand) => {
              const isActive = activeBrandId === brand.id && activeSection === "webstory";
              return (
                <Link key={brand.id} href={`/admin/${brand.id}/webstory`} onClick={close}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
                    isActive ? "bg-white text-slate-900" : "text-slate-300 hover:bg-white/10"
                  }`}>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${brand.dot}`} />
                  <span>{brand.shortName}</span>
                  <span className={`ml-auto text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                    isActive ? brand.badge : "opacity-0"
                  }`}>{brand.logoText}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Quick shortcuts */}
        <div className="mt-6">
          <p className="px-3 text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Quick write</p>
          <nav className="space-y-1 text-sm font-semibold">
            {BRANDS.map((brand) => (
              <Link key={`blog-${brand.id}`} href={`/admin/${brand.id}/blog`} onClick={close}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-slate-400 hover:bg-white/10 transition text-xs">
                <PenLine size={13} />
                <span>{brand.shortName} Blog</span>
              </Link>
            ))}
            {BRANDS.map((brand) => (
              <Link key={`story-${brand.id}`} href={`/admin/${brand.id}/webstory`} onClick={close}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-slate-400 hover:bg-white/10 transition text-xs">
                <BookOpen size={13} />
                <span>{brand.shortName} Story</span>
              </Link>
            ))}
          </nav>
        </div>

        {/* Logout */}
        <div className="mt-auto pt-4">
          <button onClick={logout}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-600">
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>
    </>
  );
}

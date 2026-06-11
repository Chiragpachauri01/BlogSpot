"use client";

import Sidebar from "@/components/admin/Sidebar";
import AdminProtected from "@/components/admin/AdminProtected";

export default function AdminShell({ children }) {
  return (
    <AdminProtected>
      <div className="min-h-screen bg-slate-50 text-slate-950 md:flex">
        <Sidebar />
        <main className="min-w-0 flex-1 px-3 pb-24 pt-16 sm:px-5 md:px-8 md:py-8 lg:px-10">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </AdminProtected>
  );
}

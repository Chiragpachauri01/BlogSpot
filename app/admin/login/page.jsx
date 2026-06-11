"use client";

import { useState } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "@/firebase/firebase.auth";
import { isAllowedAdminEmail } from "@/lib/allowedAdmins";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      if (!isAllowedAdminEmail(user.email)) {
        await signOut(auth);
        setError("This account is not allowed to access Blog Master.");
        return;
      }
      router.push("/admin/dashboard");
    } catch {
      setError("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex justify-center items-center bg-slate-50">
      <form onSubmit={handleLogin} className="bg-white shadow-xl p-10 rounded-3xl w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-900 text-white mb-4">
            <span className="text-xl font-black"><span className="text-indigo-400">B</span>M</span>
          </div>
          <h2 className="text-3xl font-extrabold text-slate-900">Blog Master</h2>
          <p className="text-slate-500 text-sm mt-1">Centralized CMS — all your brands, one place</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl">{error}</div>
        )}

        <input type="email" placeholder="Email" required
          className="w-full mt-2 p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" placeholder="Password" required
          className="w-full mt-3 p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <button disabled={loading}
          className="w-full mt-6 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold transition disabled:opacity-50 text-sm">
          {loading ? "Signing in…" : "Sign In →"}
        </button>
      </form>
    </div>
  );
}

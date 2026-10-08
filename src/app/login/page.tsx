import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; changed?: string }> }) {
  const { next, changed } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6">
        <img src="/logo.png" alt="Visayan Solar — Powering a brighter Visayas" className="mx-auto mb-4 h-36 w-auto" />
        <div className="mb-6">
          <div className="text-xs font-semibold tracking-widest text-brand-600 uppercase">Visayan Solar Ventures Corporation</div>
          <h1 className="mt-1">Purchase Orders</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to continue.</p>
        </div>
        {changed && <p className="ok-box mb-4">Password changed. Sign in with your new password.</p>}
        <LoginForm next={next ?? "/"} />
        <p className="mt-4 text-center text-sm">
          <Link href="/login/change-password" className="text-brand-700 hover:underline">Change password</Link>
        </p>
      </div>
    </main>
  );
}

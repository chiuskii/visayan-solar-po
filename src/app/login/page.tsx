import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-6">
          <div className="text-xs font-semibold tracking-widest text-brand-600 uppercase">Visayan Solar</div>
          <h1 className="mt-1">Purchase Orders</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to continue.</p>
        </div>
        <LoginForm next={next ?? "/"} />
      </div>
    </main>
  );
}

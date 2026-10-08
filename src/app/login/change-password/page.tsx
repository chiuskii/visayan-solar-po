import type { Metadata } from "next";
import Link from "next/link";
import { ChangePasswordForm } from "./form";

export const metadata: Metadata = { title: "Change password" };

export default function ChangePasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6">
        <img src="/logo.png" alt="Visayan Solar — Powering a brighter Visayas" className="mx-auto mb-4 h-24 w-auto" />
        <div className="mb-6">
          <div className="text-xs font-semibold tracking-widest text-brand-600 uppercase">Visayan Solar Ventures Corporation</div>
          <h1 className="mt-1">Change password</h1>
          <p className="mt-1 text-sm text-slate-500">Enter your current password, then choose a new one.</p>
        </div>
        <ChangePasswordForm />
        <p className="mt-4 text-center text-sm text-slate-500">
          Forgot your password? Ask an admin to set a new one.{" "}
          <Link href="/login" className="text-brand-700 hover:underline">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}

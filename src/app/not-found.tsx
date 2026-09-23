import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1>Page not found</h1>
      <p className="text-sm text-slate-500">It may have been deleted, or the link is wrong.</p>
      <Link href="/" className="btn btn-primary">Go to dashboard</Link>
    </main>
  );
}

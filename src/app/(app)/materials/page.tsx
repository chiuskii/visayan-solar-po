import { MasterListPage } from "@/components/master-pages";

export const metadata = { title: "Materials" };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; updated?: string }> }) {
  const { q, updated } = await searchParams;
  return <MasterListPage entity="materials" q={q} updated={updated} />;
}

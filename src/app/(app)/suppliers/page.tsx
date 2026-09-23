import { MasterListPage } from "@/components/master-pages";

export const metadata = { title: "Suppliers" };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <MasterListPage entity="suppliers" q={q} />;
}

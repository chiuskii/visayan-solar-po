import { MasterBulkEditPage } from "@/components/master-pages";

export const metadata = { title: "Edit Materials" };

export default async function Page({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids } = await searchParams;
  return <MasterBulkEditPage entity="materials" ids={ids} />;
}

import { MasterBulkEditPage } from "@/components/master-pages";

export const metadata = { title: "Edit Suppliers" };

export default async function Page({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids } = await searchParams;
  return <MasterBulkEditPage entity="suppliers" ids={ids} />;
}

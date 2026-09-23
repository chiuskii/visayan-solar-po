import { MasterEditPage } from "@/components/master-pages";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  return <MasterEditPage entity="materials" id={id} error={error} />;
}

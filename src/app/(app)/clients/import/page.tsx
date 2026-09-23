import { MasterImportPage } from "@/components/master-pages";

export const metadata = { title: "Import Clients" };

export default function Page() {
  return <MasterImportPage entity="clients" />;
}

import { issueStock } from "@/app/actions/inventory";
import { IssueForm } from "@/components/inventory-forms";
import { PageHeader } from "@/components/ui";
import { query } from "@/db";
import { requireUser } from "@/lib/auth";
import { todayPH } from "@/lib/format";
import { listStock } from "@/lib/inventory";

export const metadata = { title: "Issue materials" };

export default async function IssuePage() {
  await requireUser();
  const [stock, clients] = await Promise.all([listStock(), query<{ id: number; name: string }>("SELECT id, name FROM clients ORDER BY name")]);
  return (
    <>
      <PageHeader title="Issue materials" subtitle="Take materials out of stock for a client or project." back={{ href: "/inventory", label: "Inventory" }} />
      <IssueForm action={issueStock} materials={stock} clients={clients} today={todayPH()} />
    </>
  );
}

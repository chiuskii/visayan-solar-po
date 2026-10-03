import { saveBundle } from "@/app/actions/bundles";
import { listForPicker } from "@/app/actions/masters";
import { BundleForm } from "@/components/bundle-form";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "New bundle" };

export default async function NewBundlePage() {
  const opts = await listForPicker();
  return (
    <>
      <PageHeader title="New bundle" back={{ href: "/bundles", label: "Bundles" }} />
      <BundleForm
        action={saveBundle.bind(null, null)}
        isEdit={false}
        materials={opts.materials}
        suppliers={opts.suppliers}
        initial={{ name: "", description: "", items: [] }}
      />
    </>
  );
}

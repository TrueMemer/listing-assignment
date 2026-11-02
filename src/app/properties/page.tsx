import { Suspense } from "react";
import { PropertiesCatalog } from "@/components/catalog/properties-catalog";
export default function Page() {
  return (
    <Suspense>
      <PropertiesCatalog />
    </Suspense>
  );
}

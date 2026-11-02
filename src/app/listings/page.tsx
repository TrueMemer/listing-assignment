import { Suspense } from "react";
import { ListingsCatalog } from "@/components/catalog/listings-catalog";
export default function Page() {
  return (
    <Suspense>
      <ListingsCatalog />
    </Suspense>
  );
}

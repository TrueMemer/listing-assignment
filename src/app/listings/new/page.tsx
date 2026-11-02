import { Suspense } from "react";
import { NewListing } from "@/components/listings/new-listing";
export default function Page() {
  return (
    <Suspense>
      <NewListing />
    </Suspense>
  );
}

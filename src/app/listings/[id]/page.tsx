import { ListingEditor } from "@/components/listings/listing-editor";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ListingEditor key={id} id={id} />;
}

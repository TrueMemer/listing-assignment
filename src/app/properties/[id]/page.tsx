import { PropertyDetailPage } from "@/components/properties/property-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PropertyDetailPage key={id} id={id} />;
}

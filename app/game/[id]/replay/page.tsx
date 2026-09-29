import ReplayScreen from "@/components/ReplayScreen";

export default async function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReplayScreen gameId={id} />;
}

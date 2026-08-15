import { AlbumDetail } from "@/components/AlbumDetail";

export default async function AlbumPage({ params }: PageProps<"/albums/[id]">) {
  const { id } = await params;
  return <AlbumDetail id={id} />;
}

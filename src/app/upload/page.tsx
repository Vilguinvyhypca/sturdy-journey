import { UploadButton } from "@/components/UploadButton";

export default function UploadPage() {
  return <main className="mx-auto max-w-2xl p-8"><h1 className="text-3xl font-black">Upload media</h1><p className="my-4 text-slate-500">Choose a photo or video to add to your library.</p><UploadButton /></main>;
}

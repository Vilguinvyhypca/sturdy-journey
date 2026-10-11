import type { Metadata } from "next";
import { FailurePage } from "@/components/FailurePage";

export const metadata: Metadata = {
  title: "Page not found · Hymecymeyseh",
  robots: { index: false },
};

export default function NotFound() {
  return <FailurePage missing />;
}

import type { Metadata } from "next";

export const metadata: Metadata = { title: "New review" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Measured results" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

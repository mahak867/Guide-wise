import type { Metadata } from "next";

export const metadata: Metadata = { title: "Check many posts" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

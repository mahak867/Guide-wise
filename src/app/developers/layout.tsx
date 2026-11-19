import type { Metadata } from "next";

export const metadata: Metadata = { title: "API and MCP" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

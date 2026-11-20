import type { Metadata } from "next";

// Shared approval records are for the person they were sent to, never for search engines.
export const metadata: Metadata = { title: "Shared approval record", robots: "noindex", referrer: "no-referrer" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

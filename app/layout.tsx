import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "oct3 — A little less on your plate",
  description: "Browser workers your agent can hire. One brief, shared constraints, and a human in control.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

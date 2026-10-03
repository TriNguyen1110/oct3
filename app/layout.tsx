import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cue — Your agent’s extra hands",
  description: "Cue puts your agent’s plans in motion. Delegate hiring, logistics, and events through browser workers, with every commitment in your control.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

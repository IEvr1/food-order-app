import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    noimageindex: true,
  },
  openGraph: {
    title: "Διαχείριση παραγγελίας",
    type: "website",
  },
  twitter: {
    card: "summary",
  },
};

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return children;
}

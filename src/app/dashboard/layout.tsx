import type { Metadata } from "next";

export const metadata: Metadata = {
  applicationName: "Food Order Dashboard",
  manifest: "/dashboard/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Food Orders",
    statusBarStyle: "default",
  },
};

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}

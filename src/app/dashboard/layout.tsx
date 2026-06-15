import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardLangSwitch } from "@/app/dashboard/dashboard-lang-switch";

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
  return (
    <>
      <div className="fixed top-3 right-3 z-50">
        <Suspense fallback={null}>
          <DashboardLangSwitch />
        </Suspense>
      </div>
      {children}
    </>
  );
}

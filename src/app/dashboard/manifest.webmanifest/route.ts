import { NextResponse } from "next/server";

const dashboardManifest = {
  name: "Food Order Dashboard",
  short_name: "Orders",
  description: "Business dashboard for food orders.",
  start_url: "/dashboard",
  scope: "/dashboard",
  display: "standalone",
  background_color: "#fff7ed",
  theme_color: "#ea580c",
  icons: [
    {
      src: "/dashboard-icon.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any",
    },
    {
      src: "/dashboard-maskable.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "maskable",
    },
  ],
} as const;

export function GET() {
  return NextResponse.json(dashboardManifest, {
    headers: {
      "Content-Type": "application/manifest+json",
    },
  });
}

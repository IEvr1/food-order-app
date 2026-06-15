import { NextResponse } from "next/server";

const deliveryManifest = {
  name: "Food Order Delivery",
  short_name: "Delivery",
  description: "Delivery queue for food orders.",
  start_url: "/dashboard/delivery",
  scope: "/dashboard/delivery",
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
  return NextResponse.json(deliveryManifest, {
    headers: {
      "Content-Type": "application/manifest+json",
    },
  });
}

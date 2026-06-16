import { NextResponse } from "next/server";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

/** Minimal HTML for SMS/link-preview crawlers — no images, no redirect to /chat. */
export function smsLinkPreviewResponse(title: string): NextResponse {
  const safeTitle = escapeHtml(title);
  const html = `<!DOCTYPE html>
<html lang="el">
<head>
<meta charset="utf-8">
<title>${safeTitle}</title>
<meta name="robots" content="noindex, nofollow, noimageindex">
<meta property="og:title" content="${safeTitle}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary">
</head>
<body></body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow, noimageindex",
    },
  });
}

const LINK_PREVIEW_BOT =
  /bot|crawler|spider|preview|slurp|facebookexternalhit|facebot|whatsapp|telegram|twitterbot|linkedinbot|discordbot|slackbot|skypeuripreview|viber|googlebot|bingpreview|applebot|pinterest|embedly|quora link preview|showyoubot|outbrain|vkshare|redditbot|iframely|meta-externalagent/i;

export function isLinkPreviewBot(request: Request): boolean {
  const ua = request.headers.get("user-agent") ?? "";
  return LINK_PREVIEW_BOT.test(ua);
}

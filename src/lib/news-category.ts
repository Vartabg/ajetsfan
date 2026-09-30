export type NewsCategory =
  | "Roster move"
  | "Availability"
  | "Film breakdown"
  | "Game recap"
  | "Game-day guide"
  | "Team story";

// These labels describe explicit headline wording, not a reading of the article.
export function newsCategory(title: string): NewsCategory {
  const headline = title.trim().replace(/\s+/g, " ");
  if (/\b(?:ways to watch|how to watch|where to watch|where to listen)\b/i.test(headline)) return "Game-day guide";
  if (/\b(?:film breakdown|film review|film room|all-22)\b/i.test(headline)) return "Film breakdown";
  if (/\b(?:injury report|injury update|practice report|inactives)\b/i.test(headline)) return "Availability";
  if (/\b(?:game recap|postgame recap)\b/i.test(headline)) return "Game recap";
  const transaction = /\bJets (?:signs?|signed|re-signs?|re-signed|waives?|waived|releases?|released|activates?|activated|trades?|traded|acquires?|acquired|claims?|claimed|promotes?|promoted|elevates?|elevated)\b/i.test(headline);
  const otherAnnouncement = /\b(?:autographs|schedule|uniforms?|tickets?|statement|video)\b/i.test(headline);
  const reserveMove = /\bJets place[sd]? .+\bon (?:injured reserve|reserve\b|physically unable|IR\b|PUP\b|NFI\b)/i.test(headline);
  if (/\b(?:roster moves?|transactions?)\b/i.test(headline) || reserveMove || (transaction && !otherAnnouncement)) return "Roster move";
  return "Team story";
}

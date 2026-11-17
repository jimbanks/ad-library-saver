// Column order for the export. Tags first after the identifiers, so the
// sheet reads left to right as "which ad, what Jev said, then the evidence".
export const COLUMNS = [
  ["library_id", a => a.libraryId],
  ["advertiser", a => a.advertiser],
  ["format", a => a.format],
  ["cta", a => a.cta],
  ["funnel_stage", a => a.funnelStage],
  ["funnel_score", a => num(a.funnelScore)],
  ["format_confidence", a => num(a.formatConfidence)],
  ["cta_confidence", a => num(a.ctaConfidence)],
  ["funnel_confidence", a => num(a.funnelConfidence)],
  ["needs_check", a => a.needsCheck],
  ["tag_status", a => a.tagStatus],
  ["tag_error", a => a.tagError],
  ["copy", a => a.body],
  ["headline", a => a.headline],
  ["cta_button", a => a.ctaText],
  ["landing_url", a => a.landingUrl],
  ["videos", a => a.videos],
  ["images", a => a.images],
  ["carousel", a => a.carousel ? "yes" : "no"],
  ["cards", a => a.cards],
  ["versions", a => a.versions],
  ["status", a => a.status],
  ["started_running", a => a.startedRunning],
  ["stopped_running", a => a.stoppedRunning],
  ["ad_url", a => a.adUrl],
  ["page_url", a => a.pageUrl],
  ["country", a => a.country],
  ["search_query", a => a.searchQuery],
  ["view_all_page_id", a => a.viewAllPageId],
  ["first_saved", a => a.savedAt],
  ["last_seen", a => a.lastSeenAt],
  ["tagged_at", a => a.taggedAt]
];

function num(v) {
  return v == null ? "" : Math.round(v * 100) / 100;
}

function cell(v) {
  let s = v == null ? "" : String(v);
  // Ad copy is written by strangers. A cell starting with = + @ would run as
  // a formula when the CSV opens in Sheets or Excel, so neutralise it.
  if (/^[=+@\t]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCsv(ads) {
  const head = COLUMNS.map(([name]) => name).join(",");
  const rows = ads.map(a => COLUMNS.map(([, get]) => cell(get(a))).join(","));
  return [head, ...rows].join("\r\n");
}

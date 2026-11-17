// Ad Library Saver: content script.
// Reads each ad card as it scrolls into view and hands it to the background
// worker, which owns the database and the Jev calls. Meta's class names are
// obfuscated and change often, so cards are found by their visible text
// ("Library ID: …") rather than by CSS selectors.

(() => {
  const SEEN = new Set();          // Library IDs already sent this page load
  const CTA_LABELS = [
    "Shop now", "Buy now", "Order now", "Learn more", "Sign up", "Subscribe",
    "Book now", "Contact us", "Get quote", "Get offer", "Apply now", "Download",
    "Install now", "Use app", "Play game", "Watch more", "Watch video",
    "Listen now", "Send message", "Send WhatsApp message", "Call now",
    "Get directions", "See menu", "Donate now", "Get started", "Request time",
    "Visit Instagram profile", "Like Page", "Follow", "See more", "Get showtimes",
    "Open link", "Start order", "Get access", "Register", "Find out more"
  ].map(s => s.toLowerCase());
  const NOISE = /^(Menu|See ad details|See summary details|EU transparency|Platforms|Open Drop-down|Active|Inactive|Sponsored|​)$/i;
  const DOMAIN_LINE = /^[A-Z0-9-]+(\.[A-Z0-9-]+)+$/;   // "GYMSHARK.COM" link captions
  const TIME_LINE = /^\d+:\d{2}( \/ \d+:\d{2})?$/;        // video player "0:00"
  // Meta's reach label. It renders inside the copy block, so without this it
  // was saved as the last line of the ad copy.
  const LOW_IMPRESSION = /^Low impression count$/i;
  // Dates come in the viewer's locale: "2 Jul 2026" (UK) or "Jul 2, 2026" (US).
  const DATE = "(\\d{1,2} \\w{3,9} \\d{4}|\\w{3,9} \\d{1,2}, \\d{4})";
  const RANGE = new RegExp(`^${DATE} - ${DATE}`, "m");

  let enabled = true;
  chrome.storage.local.get({ autoSave: true }, s => { enabled = s.autoSave; });
  chrome.storage.onChanged.addListener(ch => {
    if (ch.autoSave) enabled = ch.autoSave.newValue;
  });

  // Climb from a "Library ID" text node to the largest ancestor that still
  // holds exactly one ad.
  function cardFor(textNode) {
    let el = textNode.parentElement, card = el;
    while (el && el !== document.body) {
      if ((el.innerText.match(/Library ID/g) || []).length > 1) break;
      card = el;
      el = el.parentElement;
    }
    return card;
  }

  function lines(text) {
    return text.split("\n").map(s => s.trim()).filter(s => s && s !== "​");
  }

  function landingFrom(href) {
    try {
      const u = new URL(href);
      const target = u.hostname === "l.facebook.com" ? u.searchParams.get("u") : href;
      if (!target) return "";
      const t = new URL(target);
      return t.origin + t.pathname;   // drop tracking parameters
    } catch (e) {
      return "";
    }
  }

  function parseCard(card) {
    const text = card.innerText;
    const id = (text.match(/Library ID:\s*(\d+)/) || [])[1];
    if (!id) return null;
    const ls = lines(text);

    // The link block under the media (caption, headline, CTA button) is an
    // outbound anchor via l.facebook.com. The ad copy itself is a clickable
    // div, so role="button" text can't be used to find the headline.
    const isCta = s => CTA_LABELS.includes(s.toLowerCase());
    const linkBlocks = [...card.querySelectorAll('a[href*="l.facebook.com"]')]
      .filter(a => a.innerText.trim() && !/^https?:/.test(a.innerText.trim()));
    const linkParts = linkBlocks.flatMap(a => lines(a.innerText))
      .filter(t => !/^https?:/.test(t));
    const lastLine = ls[ls.length - 1] || "";
    const ctaText = linkParts.find(isCta) || (isCta(lastLine) ? lastLine : "");
    const headline = linkParts.find(t => !isCta(t) && !DOMAIN_LINE.test(t)) || "";

    // Advertiser is the line before "Sponsored"; the copy runs from there to
    // the first media / link-block / CTA line.
    const sp = ls.findIndex(l => l === "Sponsored");
    const advertiser = sp > 0 ? ls[sp - 1] : "";
    const stop = new Set(linkParts);
    const body = [];
    for (let i = sp + 1; sp >= 0 && i < ls.length; i++) {
      const l = ls[i];
      if (TIME_LINE.test(l) || DOMAIN_LINE.test(l) || stop.has(l) || isCta(l)) break;
      if (LOW_IMPRESSION.test(l)) continue;
      body.push(l);
    }

    const videos = card.querySelectorAll("video").length;
    const images = [...card.querySelectorAll("img")]
      .filter(i => Math.max(i.naturalWidth, i.width) > 150).length;
    const carouselArrows = card.querySelectorAll('[aria-label*="next" i]').length;

    const links = [...card.querySelectorAll("a[href]")];
    const pageLink = links.find(a => /^https:\/\/www\.facebook\.com\/(?!ads\/)/.test(a.href));
    const outbound = links.map(a => landingFrom(a.href))
      .find(u => u && !/facebook\.com|instagram\.com|\/\/fb\.me\//.test(u)) || "";

    // Active ads say "Started running on 2 Jul 2026"; inactive ones show a
    // bare range, "14 Nov 2025 - 28 Jul 2026". Either can be followed by
    // " · Total active time 2 hrs", which is kept apart from the date.
    const running = text.match(/Started running on ([^\n·]+)/) || text.match(RANGE) || [];
    const activeTime = (text.match(/Total active time ([^\n·]+)/) || [])[1] || "";

    const params = new URLSearchParams(location.search);
    return {
      libraryId: id,
      adUrl: "https://www.facebook.com/ads/library/?id=" + id,
      advertiser,
      pageUrl: pageLink ? pageLink.href.split("?")[0] : "",
      status: /^Inactive$/m.test(text) ? "Inactive" : "Active",
      startedRunning: (running[1] || "").trim(),
      stoppedRunning: (running[2] || "").trim(),
      activeTime: activeTime.trim(),
      lowImpressions: ls.some(l => LOW_IMPRESSION.test(l)),
      versions: Number((text.match(/(\d+) ads use this creative/) || [])[1] || 1),
      body: body.join("\n"),
      headline,
      ctaText,
      landingUrl: outbound,
      videos,
      images,
      // Each carousel card carries its own link block; images below the fold
      // are lazy-loaded, so the image count alone misses carousels.
      carousel: images > 1 || carouselArrows > 0 || linkBlocks.length > 1,
      cards: Math.max(linkBlocks.length, images, 1),
      country: params.get("country") || "",
      searchQuery: params.get("q") || "",
      viewAllPageId: params.get("view_all_page_id") || "",
      savedAt: new Date().toISOString()
    };
  }

  function badge(card, label, state) {
    let b = card.querySelector(":scope > .als-badge");
    if (!b) {
      b = document.createElement("div");
      b.className = "als-badge";
      if (getComputedStyle(card).position === "static") card.style.position = "relative";
      card.appendChild(b);
    }
    b.textContent = label;
    b.dataset.state = state;
  }

  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting || !enabled) continue;
      const card = e.target;
      io.unobserve(card);
      const ad = parseCard(card);
      if (!ad || SEEN.has(ad.libraryId)) continue;
      SEEN.add(ad.libraryId);
      card.dataset.alsId = ad.libraryId;
      badge(card, "Saving…", "pending");
      chrome.runtime.sendMessage({ type: "saveAd", ad }, res => {
        if (chrome.runtime.lastError || !res) return badge(card, "Not saved", "error");
        badge(card, res.isNew ? "Saved" : "Already saved", "saved");
      });
    }
  }, { threshold: 0.5 });

  // Background reports tags as they land, so the badge can show them.
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type !== "tagged") return;
    const card = document.querySelector(`[data-als-id="${msg.libraryId}"]`);
    if (!card) return;
    if (msg.error) badge(card, "Saved · tag failed", "error");
    else badge(card, `Saved · ${msg.format} · ${msg.cta} · ${msg.funnel}`, "tagged");
  });

  function scan() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (!/^Library ID/.test(n.textContent.trim())) continue;
      const card = cardFor(n);
      if (card.dataset.alsWatched) continue;
      card.dataset.alsWatched = "1";
      io.observe(card);
    }
  }

  let pending = null;
  new MutationObserver(() => {
    clearTimeout(pending);
    pending = setTimeout(scan, 400);
  }).observe(document.body, { childList: true, subtree: true });
  scan();

})();

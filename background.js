// Ad Library Saver: background service worker.
// Owns the database (IndexedDB, one record per Library ID) and the Jev queue.
// The content script and the popup only talk to this file.

import { QUESTIONS, LOW_CONFIDENCE } from "./questions.js";
import { cleanBody } from "./csv.js";

const DB_NAME = "ad-library-saver";
const STORE = "ads";
const JEV_URL = "https://api.typesafe.ai/v1/systemone";
const CONCURRENCY = 3;

// ---- database -------------------------------------------------------------

let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const s = req.result.createObjectStore(STORE, { keyPath: "libraryId" });
        s.createIndex("tagStatus", "tagStatus");
        s.createIndex("advertiser", "advertiser");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out && "result" in out ? out.result : out);
    t.onerror = () => reject(t.error);
  });
}

const getAd = id => tx("readonly", s => s.get(id));
const putAd = ad => tx("readwrite", s => s.put(ad));
const allAds = () => tx("readonly", s => s.getAll());
const clearAds = () => tx("readwrite", s => s.clear());

// ---- Jev ------------------------------------------------------------------

async function settings() {
  return chrome.storage.local.get({ apiKey: "", autoTag: true, model: "jev-latest" });
}

function mediaSummary(ad) {
  const parts = [];
  if (ad.videos) parts.push(ad.videos + (ad.videos > 1 ? " videos" : " video"));
  if (ad.images) parts.push(ad.images + (ad.images > 1 ? " images" : " image"));
  if (ad.carousel) parts.push("carousel of " + (ad.cards || 2) + " cards");
  if (/canvas_doc/.test(ad.landingUrl || "")) parts.push("opens an instant experience");
  return parts.join(", ") || "no image or video found on the card";
}

function stateFor(ad) {
  return {
    advertiser: ad.advertiser,
    copy: cleanBody(ad),
    headline: ad.headline,
    cta_button: ad.ctaText || "none shown",
    media: mediaSummary(ad)
  };
}

async function askJev(ad, cfg) {
  const res = await fetch(JEV_URL, {
    method: "POST",
    headers: { "Authorization": "Bearer " + cfg.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ model: cfg.model, state: stateFor(ad), questions: QUESTIONS })
  });
  if (!res.ok) throw new Error("HTTP " + res.status + " " + (await res.text()).slice(0, 200));
  return res.json();
}

const FUNNEL = ["awareness", "consideration", "conversion"];

function applyAnswers(ad, out) {
  const a = out.answers || {};
  ad.format = a.format?.choice || "";
  ad.formatConfidence = a.format?.confidence ?? null;
  ad.cta = a.cta?.choice || "";
  ad.ctaConfidence = a.cta?.confidence ?? null;
  ad.funnelScore = a.funnel?.score ?? null;   // 0 awareness … 2 conversion, keep the decimal for ranking
  ad.funnelStage = ad.funnelScore == null ? "" : FUNNEL[Math.round(ad.funnelScore)];
  ad.funnelConfidence = a.funnel?.confidence ?? null;
  // Confidence says how decisively Jev picked, not whether it is right.
  // Below the line the tag is kept but flagged for a human look.
  const low = [["format", ad.formatConfidence], ["cta", ad.ctaConfidence], ["funnel", ad.funnelConfidence]]
    .filter(([, c]) => c != null && c < LOW_CONFIDENCE).map(([k]) => k);
  ad.needsCheck = low.join(" ");
  ad.jevTokens = out.usage?.input_tokens || 0;
  ad.taggedAt = new Date().toISOString();
  ad.tagStatus = "tagged";
  ad.tagError = "";
  return ad;
}

const queue = [];
let running = 0;

function enqueue(id) {
  if (!queue.includes(id)) queue.push(id);
  pump();
}

async function pump() {
  while (running < CONCURRENCY && queue.length) {
    const id = queue.shift();
    running++;
    tagOne(id).finally(() => { running--; pump(); });
  }
}

async function tagOne(id) {
  const cfg = await settings();
  const ad = await getAd(id);
  if (!ad) return;
  if (!cfg.apiKey) {
    ad.tagStatus = "untagged";
    ad.tagError = "No Jev key set (open the extension options)";
    await putAd(ad);
    return;
  }
  try {
    applyAnswers(ad, await askJev(ad, cfg));
    await putAd(ad);
    notify(ad, null);
  } catch (e) {
    ad.tagStatus = "failed";
    ad.tagError = String(e.message || e).slice(0, 300);
    await putAd(ad);
    notify(ad, ad.tagError);
  }
}

function notify(ad, error) {
  const msg = { type: "tagged", libraryId: ad.libraryId, error,
    format: ad.format, cta: ad.cta, funnel: ad.funnelStage };
  chrome.tabs.query({ url: "https://www.facebook.com/ads/library/*" }, tabs => {
    for (const t of tabs) chrome.tabs.sendMessage(t.id, msg, () => void chrome.runtime.lastError);
  });
}

// ---- messages -------------------------------------------------------------

async function handle(msg) {
  switch (msg.type) {
    case "saveAd": {
      const existing = await getAd(msg.ad.libraryId);
      if (existing) {
        // Keep the tags and first-seen time; refresh what the page shows now.
        existing.status = msg.ad.status;
        existing.versions = msg.ad.versions;
        existing.activeTime = msg.ad.activeTime;
        existing.lowImpressions = msg.ad.lowImpressions;
        existing.lastSeenAt = msg.ad.savedAt;
        await putAd(existing);
        return { isNew: false };
      }
      const ad = { ...msg.ad, lastSeenAt: msg.ad.savedAt, tagStatus: "untagged", tagError: "" };
      await putAd(ad);
      if ((await settings()).autoTag) enqueue(ad.libraryId);
      return { isNew: true };
    }
    case "stats": {
      const ads = await allAds();
      const count = s => ads.filter(a => a.tagStatus === s).length;
      return {
        total: ads.length, tagged: count("tagged"), untagged: count("untagged"),
        failed: count("failed"), needsCheck: ads.filter(a => a.needsCheck).length,
        advertisers: new Set(ads.map(a => a.advertiser)).size,
        queued: queue.length + running
      };
    }
    case "tagPending": {
      const ads = await allAds();
      const todo = msg.all ? ads : ads.filter(a => a.tagStatus !== "tagged");
      todo.forEach(a => enqueue(a.libraryId));
      return { queued: todo.length };
    }
    case "allAds":
      return { ads: await allAds() };
    case "clear":
      queue.length = 0;
      await clearAds();
      return { ok: true };
    case "testKey": {
      // Sends one invented ad, never a saved one.
      const cfg = await settings();
      if (!cfg.apiKey) return { ok: false, error: "No key saved" };
      try {
        const out = await askJev({ advertiser: "Test Brand", body: "20% off all socks this weekend. Use code TEST20.",
          headline: "Weekend sale", ctaText: "Shop now", images: 1, videos: 0, carousel: false }, cfg);
        return { ok: true, sample: applyAnswers({}, out) };
      } catch (e) {
        return { ok: false, error: String(e.message || e) };
      }
    }
  }
  return { error: "unknown message " + msg.type };
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  handle(msg).then(reply, e => reply({ error: String(e) }));
  return true;   // keep the channel open for the async reply
});

// A service worker can be stopped mid-queue. On wake, pick up anything left.
chrome.runtime.onStartup.addListener(async () => {
  if (!(await settings()).autoTag) return;
  (await allAds()).filter(a => a.tagStatus === "untagged").forEach(a => enqueue(a.libraryId));
});

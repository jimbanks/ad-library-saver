import { toCsv } from "./csv.js";

const $ = id => document.getElementById(id);
const send = msg => chrome.runtime.sendMessage(msg);

async function refresh() {
  const s = await send({ type: "stats" });
  $("total").textContent = s.total;
  $("advertisers").textContent = s.advertisers;
  $("tagged").textContent = s.tagged;
  $("pending").textContent = s.untagged + s.failed;
  const { apiKey } = await chrome.storage.local.get({ apiKey: "" });
  const bits = [];
  if (!apiKey) bits.push('<span class="warn">No Jev key yet, so nothing is tagged.</span>');
  if (s.queued) bits.push(s.queued + " in the Jev queue.");
  if (s.needsCheck) bits.push(s.needsCheck + " tags below 60% confidence (needs_check column).");
  $("note").innerHTML = bits.join(" ");
}

chrome.storage.local.get({ autoSave: true, autoTag: true }, s => {
  $("autoSave").checked = s.autoSave;
  $("autoTag").checked = s.autoTag;
});
$("autoSave").onchange = e => chrome.storage.local.set({ autoSave: e.target.checked });
$("autoTag").onchange = e => chrome.storage.local.set({ autoTag: e.target.checked });

$("export").onclick = async () => {
  const { ads } = await send({ type: "allAds" });
  if (!ads.length) return ($("note").textContent = "Nothing saved yet.");
  ads.sort((a, b) => (a.advertiser || "").localeCompare(b.advertiser || "") || (a.savedAt < b.savedAt ? -1 : 1));
  const blob = new Blob(["﻿" + toCsv(ads)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "ad-library-" + new Date().toISOString().slice(0, 10) + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};

$("tagPending").onclick = async () => {
  const r = await send({ type: "tagPending" });
  $("note").textContent = r.queued + " ads sent to the Jev queue.";
};

$("retagAll").onclick = async () => {
  const r = await send({ type: "tagPending", all: true });
  $("note").textContent = r.queued + " ads sent to the Jev queue.";
};

$("clear").onclick = async () => {
  const btn = $("clear");
  if (btn.dataset.armed !== "1") {
    btn.dataset.armed = "1";
    btn.textContent = "Click again to delete every saved ad";
    return;
  }
  await send({ type: "clear" });
  btn.dataset.armed = "";
  btn.textContent = "Clear database…";
  refresh();
};

$("options").onclick = e => { e.preventDefault(); chrome.runtime.openOptionsPage(); };

refresh();
setInterval(refresh, 1500);

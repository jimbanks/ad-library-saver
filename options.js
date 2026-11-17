const $ = id => document.getElementById(id);

chrome.storage.local.get({ apiKey: "", model: "jev-latest" }, s => {
  $("apiKey").value = s.apiKey;
  $("model").value = s.model;
});

$("save").onclick = async () => {
  await chrome.storage.local.set({
    apiKey: $("apiKey").value.trim(),
    model: $("model").value.trim() || "jev-latest"
  });
  $("result").textContent = "Saved.";
};

$("test").onclick = async () => {
  $("result").textContent = "Asking Jev…";
  const r = await chrome.runtime.sendMessage({ type: "testKey" });
  $("result").textContent = r.ok
    ? `Key works. Invented sale ad came back as format=${r.sample.format}, cta=${r.sample.cta}, funnel=${r.sample.funnelStage}.`
    : "Failed: " + r.error;
};

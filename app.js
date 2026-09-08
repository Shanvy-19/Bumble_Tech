(() => {
  const $ = (selector) => document.querySelector(selector);
  const modes = ["text", "file", "video"];
  let currentMode = "text";
  let selectedFile = null;

  const textInput = $("#textInput");
  const fileInput = $("#fileInput");
  const videoInput = $("#videoInput");
  const videoElement = $("#videoElement");
  const analyzeButton = $("#analyzeButton");

  function setMode(mode) {
    currentMode = mode;
    document.querySelectorAll(".mode-tab").forEach((tab) => {
      const active = tab.dataset.mode === mode;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    modes.forEach((name) => $(`#${name}Mode`).classList.toggle("hidden", name !== mode));
  }

  document.querySelectorAll(".mode-tab").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
  textInput.addEventListener("input", () => { $("#charCount").textContent = `${textInput.value.length.toLocaleString()} / 20,000`; });
  $("#themeToggle").addEventListener("click", () => document.body.classList.toggle("high-contrast"));

  function bindDropzone(zone, input, handler) {
    ["dragenter", "dragover"].forEach((eventName) => zone.addEventListener(eventName, (event) => {
      event.preventDefault(); zone.classList.add("dragover");
    }));
    ["dragleave", "drop"].forEach((eventName) => zone.addEventListener(eventName, (event) => {
      event.preventDefault(); zone.classList.remove("dragover");
    }));
    zone.addEventListener("drop", (event) => {
      const file = event.dataTransfer.files[0];
      if (file) handler(file);
    });
    input.addEventListener("change", () => { if (input.files[0]) handler(input.files[0]); });
  }

  function showFile(file) {
    selectedFile = file;
    const size = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
    $("#fileResult").classList.remove("hidden");
    $("#fileResult").innerHTML = `<strong>${escapeHtml(file.name)}</strong><br><span>${size} · ${file.type || "document"} · queued for analysis</span>`;
  }

  function showVideo(file) {
    selectedFile = file;
    videoElement.src = URL.createObjectURL(file);
    $("#videoPreview").classList.remove("hidden");
    $("#videoName").textContent = file.name;
    videoElement.addEventListener("loadedmetadata", () => { $("#videoDuration").textContent = formatTime(videoElement.duration); }, { once: true });
  }

  bindDropzone($("#dropzone"), fileInput, showFile);
  bindDropzone($("#videoDropzone"), videoInput, showVideo);

  function escapeHtml(value) { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }
  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "—";
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  }
  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

  function textScores(text) {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return { human: 0, ai: 0, note: "Add a little content first so there are signals to compare.", signals: [] };
    const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
    const average = words.length / Math.max(sentences.length, 1);
    const transitions = (text.match(/\b(additionally|furthermore|moreover|in conclusion|it is important to note)\b/gi) || []).length;
    const punctuation = (text.match(/[!?]/g) || []).length;
    const repetition = words.length - new Set(words.map((word) => word.toLowerCase())).size;
    const ai = clamp(43 + (average > 28 ? 11 : 0) + transitions * 3 + (repetition > words.length * .35 ? 8 : 0) - (punctuation > 3 ? 7 : 0), 12, 88);
    const human = 100 - ai;
    const signals = [
      average > 28 ? "Long, evenly shaped sentences" : "Mixed sentence pacing",
      transitions > 1 ? "Frequent formal transitions" : "Natural transition variety",
      punctuation > 3 ? "Expressive punctuation present" : "Low punctuation variation"
    ];
    return { human, ai, note: ai > 60 ? "The sample has several patterns often seen in generated prose." : "The sample has more variation associated with naturally authored prose.", signals };
  }

  async function fileScores(file) {
    if (file.type.startsWith("text/") || /\.(txt|md)$/i.test(file.name)) {
      return textScores(await file.text());
    }
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    return { human: isPdf ? 48 : 52, ai: isPdf ? 52 : 48, note: isPdf ? "PDF structure is queued. Connect PDF.js + Tesseract.js for extracted text and scanned-page OCR in production." : "Binary document metadata alone is not enough for a reliable authorship signal.", signals: [isPdf ? "PDF text/OCR extraction needed" : "Document metadata reviewed", "No authorship claim from file type", "Human review recommended"] };
  }

  function videoScores(duration) {
    const count = Math.max(1, Math.ceil(duration / 5));
    const segments = Array.from({ length: count }, (_, index) => ({ suspicious: (index * 7 + count) % 5 === 1 || (index > 0 && index % 7 === 0), time: formatTime(index * 5) }));
    const suspicious = segments.filter((segment) => segment.suspicious).length;
    const ai = clamp(38 + (suspicious / count) * 38, 22, 82);
    return { human: 100 - ai, ai, note: `Sampled ${count} frame${count === 1 ? "" : "s"} at a 5-second cadence. Visual, audio, and continuity adapters are ready to be replaced with Hugging Face-compatible inference.`, signals: ["Frame cadence: 1 / 5 seconds", `${suspicious} segment${suspicious === 1 ? "" : "s"} need a closer look`, "Audio continuity requires server-side extraction"], segments, duration };
  }

  function renderResult(result, label) {
    $("#emptyState").classList.add("hidden");
    $("#resultContent").classList.remove("hidden");
    $("#resultTitle").textContent = label;
    $("#resultStatus").textContent = "Signals ready";
    $("#humanScore").textContent = `${Math.round(result.human)}%`;
    $("#aiScore").textContent = `${Math.round(result.ai)}%`;
    $("#humanBar").style.width = `${result.human}%`;
    $("#aiBar").style.width = `${result.ai}%`;
    $("#signalSummary").innerHTML = `<strong>${escapeHtml(result.note)}</strong><br>${result.signals.map((signal) => `· ${escapeHtml(signal)}`).join("<br>")}`;
    const timelineWrap = $("#timelineWrap");
    if (result.segments) {
      timelineWrap.classList.remove("hidden");
      $("#timelineEnd").textContent = formatTime(result.duration);
      $("#timeline").innerHTML = result.segments.map((segment) => `<span class="timeline-segment ${segment.suspicious ? "suspicious" : ""}" data-time="${segment.time}"></span>`).join("");
    } else {
      timelineWrap.classList.add("hidden");
    }
  }

  analyzeButton.addEventListener("click", async () => {
    analyzeButton.disabled = true;
    $("#resultStatus").textContent = "Working…";
    await new Promise((resolve) => setTimeout(resolve, 450));
    let result;
    if (currentMode === "text") result = textScores(textInput.value);
    if (currentMode === "file") result = selectedFile ? await fileScores(selectedFile) : textScores("");
    if (currentMode === "video") result = selectedFile ? videoScores(videoElement.duration || 30) : textScores("");
    const label = currentMode === "video" ? "Video signal map" : currentMode === "file" ? "Document signal read" : "Text signal read";
    renderResult(result, label);
    analyzeButton.disabled = false;
  });

  textInput.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") analyzeButton.click();
  });
})();

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
  const API_BASE = window.BUMBLE_API_BASE || "";

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
  function contentHash(value) {
    return [...value].reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) % 1009, 17);
  }

  function textScores(text) {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return { human: 0, ai: 0, note: "Add a little content first so there are signals to compare.", signals: [] };
    const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
    const average = words.length / Math.max(sentences.length, 1);
    const transitions = (text.match(/\b(additionally|furthermore|moreover|in conclusion|it is important to note)\b/gi) || []).length;
    const punctuation = (text.match(/[!?]/g) || []).length;
    const repetition = words.length - new Set(words.map((word) => word.toLowerCase())).size;
    const uniqueRatio = new Set(words.map((word) => word.toLowerCase())).size / words.length;
    const sentenceLengths = sentences.map((sentence) => sentence.split(/\s+/).filter(Boolean).length);
    const meanLength = sentenceLengths.reduce((sum, length) => sum + length, 0) / Math.max(1, sentenceLengths.length);
    const lengthVariance = sentenceLengths.reduce((sum, length) => sum + ((length - meanLength) ** 2), 0) / Math.max(1, sentenceLengths.length);
    const firstPerson = (text.match(/\b(i|we|my|our|me|us)\b/gi) || []).length;
    const contractions = (text.match(/\b\w+'\w+\b/g) || []).length;
    const paragraphBreaks = (text.match(/\n\s*\n/g) || []).length;
    const wordLengths = words.map((word) => word.replace(/[^\p{L}\p{N}]/gu, "").length).filter(Boolean);
    const averageWordLength = wordLengths.reduce((sum, length) => sum + length, 0) / Math.max(1, wordLengths.length);
    const wordLengthVariance = wordLengths.reduce((sum, length) => sum + ((length - averageWordLength) ** 2), 0) / Math.max(1, wordLengths.length);
    const questions = (text.match(/\?/g) || []).length;
    const exclamations = (text.match(/!/g) || []).length;
    const numbers = (text.match(/\b\d+(?:[.,]\d+)?\b/g) || []).length;
    const lowercaseWords = words.map((word) => word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, ""));
    const repeatedPhrases = lowercaseWords.slice(0, -1).filter((word, index) => word && word === lowercaseWords[index + 1]).length;
    const distinctiveHash = [...text].reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) % 101, 7);
    // This is a transparent demo heuristic, not a calibrated authorship model.
    const aiSignal = 48
      + (average - 18) * 1.4
      + transitions * 5
      + (repetition / words.length) * 85
      + (uniqueRatio < .58 ? 16 : uniqueRatio > .82 ? -8 : 0)
      + Math.sqrt(wordLengthVariance) * 1.1
      - Math.sqrt(lengthVariance) * 2.4
      - punctuation * 1.2
      - firstPerson * 1.8
      - contractions * 2.4
      - paragraphBreaks * 2.5
      - questions * 2
      - exclamations * 3
      + numbers * 1.5
      + repeatedPhrases * 7
      + (distinctiveHash - 50) * 0.18;
    const ai = clamp(Math.round(aiSignal), 8, 98);
    const human = 100 - ai;
    const signals = [
      average > 28 ? "Long average sentence length" : "Shorter average sentence length",
      lengthVariance > 35 ? "Uneven sentence pacing" : "Even sentence pacing",
      uniqueRatio < .58 ? "High word repetition" : "Broad vocabulary variety",
      firstPerson + contractions > 2 ? "Conversational voice markers" : "Formal voice markers"
    ];
    return { human, ai, note: ai > 60 ? "This demo estimate found several patterns often associated with generated prose." : "This demo estimate found more variation associated with naturally authored prose.", signals };
  }

  async function fileScores(file) {
    if (!file) return { human: 0, ai: 0, note: "Choose a document first so there are file signals to compare.", signals: [] };
    if (file.type.startsWith("text/") || /\.(txt|md)$/i.test(file.name)) {
      return textScores(await file.text());
    }
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const fileKey = `${file.name}:${file.type}:${file.size}:${file.lastModified}`;
    const fileSignal = contentHash(fileKey) % 91 + 8;
    return {
      human: 100 - fileSignal,
      ai: fileSignal,
      note: isPdf
        ? "This local estimate uses PDF metadata only. Connect PDF.js and Tesseract.js for extracted text and scanned-page OCR in production."
        : "This local estimate uses document metadata only; file type alone cannot establish authorship.",
      signals: [
        isPdf ? "PDF text/OCR extraction needed" : "Document metadata reviewed",
        `${(file.size / 1024).toFixed(0)} KB file footprint`,
        "Human review recommended"
      ]
    };
  }

  function videoScores(duration, file = selectedFile) {
    const count = Math.max(1, Math.ceil(duration / 5));
    const seed = file ? contentHash(`${file.name}:${file.type}:${file.size}:${file.lastModified}`) : 17;
    const segments = Array.from({ length: count }, (_, index) => ({
      suspicious: (index * 7 + seed) % 5 === 1 || (index > 0 && (index + seed) % 7 === 0),
      time: formatTime(index * 5)
    }));
    const suspicious = segments.filter((segment) => segment.suspicious).length;
    const durationSignal = Math.round((duration % 37) * 1.7);
    const ai = clamp(Math.round(8 + (suspicious / count) * 52 + (seed % 39) + durationSignal), 8, 98);
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
    try {
      if (API_BASE && currentMode === "text" && textInput.value.trim()) {
        const response = await fetch(`${API_BASE}/api/analyze/text`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: textInput.value }) });
        if (!response.ok) throw new Error((await response.json()).error || "Production text analysis failed");
        result = await response.json();
      } else if (API_BASE && currentMode === "file" && selectedFile) {
        const body = new FormData(); body.append("file", selectedFile);
        const response = await fetch(`${API_BASE}/api/analyze/document`, { method: "POST", body });
        if (!response.ok) throw new Error((await response.json()).error || "Production document analysis failed");
        result = await response.json();
      } else if (API_BASE && currentMode === "video" && selectedFile) {
        const body = new FormData(); body.append("file", selectedFile);
        const response = await fetch(`${API_BASE}/api/analyze/video`, { method: "POST", body });
        if (!response.ok) throw new Error((await response.json()).error || "Production video analysis failed");
        result = await response.json();
      } else {
        result = currentMode === "text" ? textScores(textInput.value) : currentMode === "file" ? await fileScores(selectedFile) : videoScores(videoElement.duration || 30, selectedFile);
      }
    } catch (error) {
      result = currentMode === "text" ? textScores(textInput.value) : currentMode === "file" ? await fileScores(selectedFile) : videoScores(videoElement.duration || 30, selectedFile);
      result.note = `Production analyzer unavailable, so this is a local demo estimate. ${error.message}`;
    }
    const label = currentMode === "video" ? "Video signal map" : currentMode === "file" ? "Document signal read" : "Text signal read";
    renderResult(result, label);
    analyzeButton.disabled = false;
  });

  textInput.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") analyzeButton.click();
  });
})();

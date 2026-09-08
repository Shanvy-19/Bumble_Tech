# Bumble Tech

Bumble Tech is a polished, Chrome-accessible front end for exploring whether text, documents, and video contain signals commonly associated with AI generation. It is intentionally honest about uncertainty: the interface presents probabilistic signals, not proof of authorship.

## Run locally

No build step or package install is required.

1. Open `index.html` directly in Chrome, or serve this folder:

   ```powershell
   python -m http.server 8080
   ```

2. Visit <http://localhost:8080>.

The app includes a local demo analyzer so the UI is useful without API keys. It supports:

- Text analysis with lightweight local pattern signals.
- TXT and Markdown extraction in-browser.
- PDF/DOCX/image intake with an explicit extraction/OCR handoff message.
- Video metadata preview and a 1-frame-per-5-seconds suspicious-segment timeline.
- High-contrast toggle and keyboard shortcut (`Ctrl/Cmd + Enter`).

## Production inference path

The demo intentionally does not imply that heuristics are a validated detector. For production, replace the small scoring functions in `app.js` with a server-side adapter that:

1. Extracts PDF/DOCX text (for example, PDF.js and Mammoth) and sends scanned pages through Tesseract.js or a hosted OCR model.
2. Samples video frames with FFmpeg at 5-second intervals and extracts audio features separately.
3. Calls Hugging Face Inference Endpoints or a self-hosted Transformers service for text, image, audio, and continuity classifiers.
4. Returns calibrated probabilities, model/version metadata, evidence spans, and confidence intervals.
5. Applies privacy controls, retention limits, and human review for consequential decisions.

Do not treat a detector score as a guaranteed statement that content is AI-generated or human-generated. Editing, translation, short samples, compression, and new generation tools can materially change signals.

# ASTROSAGE — Offline-First Astronaut Health Intelligence & Protocol Copilot

**Tagline:** Monitor. Understand. Verify. Guide. Report.

ASTROSAGE is an offline-first aerospace health intelligence research prototype designed for missions where Earth communication is delayed, intermittent, or unavailable.

> **Important Scientific & Safety Notice**
> ASTROSAGE is a research prototype and decision-support interface. It is **not** an AI doctor, is **not** clinically validated or flight-qualified, and does **not** claim NASA affiliation or approval. It never diagnoses medical conditions, prescribes medications, determines clinical fitness, or clears crew members for EVA. All seeded demonstration datasets are synthetic and labelled as simulated.

---

## Architecture & Tech Stack
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Recharts, Lucide React, local `@fontsource/ibm-plex-sans` & `@fontsource/ibm-plex-mono` (zero remote font dependencies)
- **Backend:** Express + TypeScript (`server.ts`) serving versioned `/api/v1/*` endpoints
- **Database:** Local SQLite (`node:sqlite` WAL mode) with versioned schema migrations (`data/astrosage.db`)
- **Local AI & Retrieval:** Local TF-IDF + BM25 vector retrieval over indexed Markdown documents in `data/knowledge/`, optional local Ollama integration (`127.0.0.1:11434`), and honest deterministic retrieval-only fallback when Ollama is offline
- **Reports:** Server-side binary PDF generation via `pdfkit` + SHA-256 integrity hash + JSON handover export

---

## Local Installation & Launch

```bash
npm install
npm run dev
```

For strict localhost-only offline binding on a laptop:
```bash
ASTROSAGE_HOST=127.0.0.1 npm run build
ASTROSAGE_HOST=127.0.0.1 npm start
```
Or use the provided launch scripts:
- macOS / Linux: `./scripts/start-offline.sh`
- Windows: `scripts\start-offline.bat`

### Optional Local Ollama Model Setup
```bash
ollama pull qwen2.5:3b
ollama serve
```
When Ollama is unavailable or communication blackout is active, ASTROSAGE clearly displays `Local AI unavailable` and continues operating with local TF-IDF reference search and deterministic SQLite summaries.

---

## Demo Scenarios (3-Minute Presentation Mode)
Click **Start Demo** in the top bar for the guided 6-step presenter flow, or open **Demo Scenarios** to load:
1. `NORMAL_MISSION` — Stable simulated telemetry and locked v1 personal baselines.
2. `GRADUAL_HEALTH_DRIFT` — Progressive resting heart-rate drift (~66 to 94 bpm) triggering explainable deterministic rule `DEMO-RULE-DEV-02`.
3. `EXPOSURE_CONTEXT` — Overlapping absorbed dose (`mGy`) and effective dose (`mSv`) windows kept strictly separate, noting temporal overlap never establishes causation.
4. `SENSOR_FAULT` — Injects `MISSING`, `INVALID`, `DUPLICATE`, `STALE`, and `UNCALIBRATED` records quarantined from baseline calculations.
5. `COMMUNICATION_BLACKOUT` — Disconnected link mode with local `offline_outbox` queuing and full offline functionality.

---

## Running Automated Tests
```bash
npm test
npm run lint
npm run build
```

# Crew Medical Handover & Offline Operations Protocol (Prototype SOP)
Version: 3.0.0 | Document ID: REF-SOP-04 | Category: Operations & Governance

<!-- page: 1 -->
## Section 4.1: Offline-First Operations During Communication Blackout
Deep-space transit, lunar far-side operations, and solar conjunctions introduce communication blackouts or multi-minute signal delays. During `COMMUNICATION_BLACKOUT`, local onboard intelligence must remain 100% operational without cloud dependencies.

When external telemetry links are disconnected:
- All biometric, dosimetry, environmental, and symptom records are stored locally in the onboard SQLite database.
- Outbound synchronization items are queued in the local `offline_outbox` with status `PENDING` or `BLOCKED_OFFLINE`.
- The system must NEVER fabricate successful ground transmission or discard queued records while offline.

<!-- page: 2 -->
## Section 4.2: Structured Medical Handover Report Requirements
To support human medical review during shift transitions or upon restoration of Earth link, every ASTROSAGE handover report must include:
1. Explicit simulation and data-source declaration.
2. Crew profile, mission context, and exact UTC review window.
3. Health measurement summary paired with personal baseline metadata (version, sample count, mean, SD, IQR).
4. Chronological symptoms and observations.
5. Radiation (preserving separate Gy and Sv quantities) and environmental context.
6. Active and acknowledged review flags with supporting record IDs and deterministic rule reasoning.
7. Explicit data-quality limitations and reference citations.
8. Unique Report ID, generation timestamp, SHA-256 content integrity reference, and human-review disclaimer.

<!-- page: 3 -->
## Section 4.3: Decision-Support Boundary & Human-in-the-Loop Rule
ASTROSAGE is a research prototype and decision-support interface. It must never diagnose medical conditions, prescribe treatments or medication doses, clear crew members for EVA, or suppress deterministic review flags via experimental machine learning models. Final interpretation and clinical decisions rest exclusively with qualified human medical personnel.

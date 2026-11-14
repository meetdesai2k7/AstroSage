# ASTROSAGE Personal Baseline & Telemetry Deviation Guide
Version: 2.1.0 | Document ID: REF-BASE-01 | Category: Physiological Baselines

<!-- page: 1 -->
## Section 1.1: Purpose of Personal Physiological Baselines
Spaceflight environments induce fluid shifts, altered circadian entrainment, microgravity cardiovascular deconditioning, and variable workload demands. Universal terrestrial clinical thresholds may fail to capture subtle individual shifts or generate false alarms for crew members whose resting physiology differs from population averages.

ASTROSAGE establishes an individual personal baseline for each crew profile using historical observations collected under defined nominal mission conditions. A baseline summarizes central tendency (mean and median) and dispersion (standard deviation and interquartile range) together with sample count, observation window, and baseline version number.

## Section 1.2: Minimum Sample Sufficiency and Explicit Approval
A statistical baseline must never be inferred from sparse telemetry. ASTROSAGE requires a minimum of 8 VALID observations (`n >= 8`) within a documented baseline period before computing statistical deviation indicators. When `n < 8`, the baseline status is marked as insufficient and deviation rules are withheld to prevent misleading comparisons.

Crucially, incoming readings must NEVER silently alter or overwrite an approved baseline. Updating a baseline is an explicit, auditable action performed by an authorized operator or medical officer, creating a new incremented baseline version (`v1`, `v2`, ...) while preserving provenance.

<!-- page: 2 -->
## Section 1.3: Statistical Deviation Indicators vs Clinical Thresholds
ASTROSAGE computes a statistical deviation indicator (such as `z = (x - mean) / stdDev`) strictly to prioritize human inspection. A statistical z-score is NOT a medical diagnosis, clinical threshold, or fitness-for-duty determination.

In ASTROSAGE demonstration rules:
- **HEALTH_DEVIATION (WATCH)**: Triggered when 3 or more consecutive VALID readings for a metric exceed `mean + 1.5 * stdDev` (or fall below `mean - 1.5 * stdDev`), provided `n >= 8` in the active baseline.
- **HEALTH_DEVIATION (URGENT REVIEW)**: Triggered when 3 or more consecutive VALID readings deviate by `>= 2.5 * stdDev` from the personal baseline or co-occur with elevated symptom severity.

All thresholds used in ASTROSAGE are explicitly labelled as demonstration review rules, not flight-certified clinical limits.

<!-- page: 3 -->
## Section 1.4: Gradual Health Drift & Multi-Metric Review
Gradual drift—such as a progressive rise in resting heart rate accompanied by reduced sleep duration or elevated respiratory rate—often appears across 24 to 72 hours before crossing any single extreme point threshold. Reviewing trends alongside reported symptoms, environmental CO2, and data-quality flags helps human flight surgeons evaluate context without drawing premature causal conclusions.

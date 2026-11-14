# Habitat Environmental Monitoring & Sensor Data Quality Standard
Version: 1.8.0 | Document ID: REF-ENV-03 | Category: Environment & Data Quality

<!-- page: 1 -->
## Section 3.1: Environmental Context Parameters
Closed-loop spacecraft habitats continuously regulate cabin temperature (`°C`), relative humidity (`%`), total cabin pressure (`kPa`), and carbon dioxide partial pressure (`mmHg`). Elevated cabin `CO2` partial pressure can coincide with reports of headache, sluggishness, or mild cognitive slowing, making environmental context essential during physiological reviews.

ASTROSAGE tracks environmental telemetry alongside physiological trends on a unified 72-hour timeline so reviewers can verify whether a physiological shift occurred during nominal cabin conditions or alongside an environmental perturbation.

<!-- page: 2 -->
## Section 3.2: Data Quality Taxonomy
Every incoming record in ASTROSAGE is evaluated before statistical baseline comparison and assigned one of six explicit data-quality statuses:
1. **VALID**: Timestamp is valid, unit matches the metric specification, source device is calibrated, and reading falls within physical plausibility bounds.
2. **MISSING**: Expected measurement slot has a null or absent value.
3. **STALE**: Timestamp exceeds the freshness threshold relative to the mission review clock or shows repeated frozen timestamps.
4. **INVALID**: Value violates physical or schema bounds (e.g., negative heart rate, SpO2 > 100%, unparseable timestamp, or missing required unit).
5. **UNCERTAIN**: Device calibration is overdue/unverified or measurement uncertainty exceeds tolerance.
6. **DUPLICATE**: Identical `(astronautId, metric, recordedAt, value)` or duplicate record ID detected during ingestion.

<!-- page: 3 -->
## Section 3.3: Handling Faulty Records in Analytics
Records marked `MISSING`, `STALE`, `INVALID`, or `DUPLICATE` are NEVER included in baseline calculations or treated as valid physiological spikes. Instead, they generate transparent `SENSOR_FAULT` or `DATA_GAP` warnings explaining why the measurement cannot be relied upon for ordinary comparison.

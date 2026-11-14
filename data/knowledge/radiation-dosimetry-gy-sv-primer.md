# Space Radiation Dosimetry Primer: Gray (Gy) vs Sievert (Sv)
Version: 1.4.0 | Document ID: REF-RAD-02 | Category: Radiation & Dosimetry

<!-- page: 1 -->
## Section 2.1: Fundamental Distinction Between Gray (Gy) and Sievert (Sv)
In radiation protection and spaceflight dosimetry, **Gray (Gy)** and **Sievert (Sv)** measure fundamentally different physical and biological quantities and MUST NEVER be treated as interchangeable.

- **Gray (Gy)** is the SI unit of **absorbed dose** (`D`), defined as 1 joule of ionizing radiation energy deposited per kilogram of matter (`1 Gy = 1 J/kg`). Absorbed dose is a purely physical quantity measured in a medium (e.g., silicon detector, tissue-equivalent phantom, or water).
- **Sievert (Sv)** is the SI unit of **equivalent dose** (`H_T`) or **effective dose** (`E`), which weights absorbed dose by radiation quality/weighting factors (`w_R`, such as for protons, heavy ions/HZE particles, and neutrons) and tissue weighting factors (`w_T`) to express stochastic biological risk estimates.

<!-- page: 2 -->
## Section 2.2: Prohibition on Naive Unit Conversion
Because space radiation fields contain complex mixed spectra (galactic cosmic rays, trapped belt protons, solar energetic particles, and secondary neutrons), converting an absorbed dose recorded in `mGy` directly into `mSv` without verified particle-spectrum LET data, detector geometry, shielding models, and organ weighting assumptions is scientifically invalid.

ASTROSAGE preserves every radiation record in its original recorded quantity (`ABSORBED_DOSE`, `EFFECTIVE_DOSE`, or `AMBIENT_DOSE_EQUIVALENT`) and original unit (`mGy`, `uGy`, `mSv`, `uSv`). ASTROSAGE never auto-converts `Gy` to `Sv` and never computes individual cancer risk or clinical prognosis from demonstration dosimetry records.

<!-- page: 3 -->
## Section 2.3: Temporal Overlap Does Not Establish Causation
During mission operations, a solar particle flux increase or orbital passage may overlap in time with reported crew symptoms (such as fatigue or headache) or cardiovascular drift. ASTROSAGE visualizes radiation, environmental, and physiological records on aligned time axes solely to assist chronological situational awareness.

**Mandatory Scientific Rule**: Temporal overlap between a radiation reading and a health change does NOT establish biological causation. Confounding factors including EVA workload, cabin CO2 fluctuation, sleep disruption, dehydration, or sensor calibration error must be evaluated by qualified medical and radiation physics personnel.

# Medications in the IBD Dashboard — Detailed Report

Medications are used across every layer of the app: FHIR extraction, classification,
display, cohort comparison, and the AI assistant. This report walks through each layer
in turn.

---

## 1. Two independent sources of medication data

The app treats medications from two completely different origins, and they are never mixed:

| Source | Origin | What it represents |
|--------|--------|--------------------|
| **FHIR `MedicationRequest`** | `PatientContext` (EHR) | The present patient's prescribing history, as recorded in the EHR |
| **CDS cohort API — `medication_history`** | `useCohortData` hook | Day-aligned treatment records for the present patient *and* matched historical cohort episodes, pre-processed by the CDS backend |

The FHIR source drives Screen A (current regimen, steroid exposure, medication history
Gantt on the general Timeline). The cohort API source drives MedTimeline (Treatment
Trajectories Gantt), Screen B (trajectory chart therapy selector), and Screen C (episode
detail panel).

---

## 2. FHIR medication extraction

### 2a. Data model

`MedicationRequest` is the only FHIR resource type used for medications. The app does
not use `MedicationStatement`, `MedicationAdministration`, or `MedicationDispense`.

Name resolution is tried in this order (first non-null wins):

```
medicationCodeableConcept.text
medicationCodeableConcept.coding[0].display
medicationCodeableConcept.coding[0].code
medicationReference.display
medication.concept.text                     ← R4B/R5 path, also checked
medication.concept.coding[0].display
medication.reference.display
```

This is implemented in `extractMedName()` in [src/modules/ibd/utils.ts](src/modules/ibd/utils.ts:104).

A simplified version of the same logic lives in `MedicationRequestModel` in
[src/data/MedicationRequestModel.ts](src/data/MedicationRequestModel.ts) for the generic
patient data layer (used outside the IBD module). The IBD-specific `extractMedName()`
handles more fallback paths and also checks R4B/R5 field names.

### 2b. Classification

Every medication name is classified into one of six drug classes. Classification is
done by substring match against hardcoded drug name lists in
[src/modules/ibd/config.ts](src/modules/ibd/config.ts):

| Class | Key drugs |
|-------|-----------|
| `biologic` | infliximab, adalimumab, ustekinumab, vedolizumab, risankizumab, ozanimod, filgotinib, tofacitinib, upadacitinib, etrasimod, mirikizumab |
| `immunomodulator` | azathioprine, mercaptopurine, 6-MP, methotrexate |
| `aminosalicylate` | mesalamine, mesalazine, sulfasalazine, balsalazide, olsalazine |
| `steroid` | prednisone, prednisolone, budesonide, methylprednisolone, dexamethasone |
| `antibiotic` | ciprofloxacin, metronidazole, rifaximin, amoxicillin, clarithromycin, flagyl |
| `other` | anything that does not match the above |

The `classifyMedication(name)` function in
[src/modules/ibd/utils.ts:94](src/modules/ibd/utils.ts#L94) applies these lists. Only
medications whose class is NOT `other` are included in IBD-related views — everything
else is silently dropped.

### 2c. Name normalization

`normalizeMedName(raw)` in [src/modules/ibd/utils.ts:139](src/modules/ibd/utils.ts#L139)
strips dosage and form tokens from a raw FHIR medication name to extract just the generic
drug name. It:

1. Splits on whitespace, commas, slashes, and brackets
2. Skips leading numeric/time-unit tokens (e.g. "24 HR")
3. Stops at the first token that is a dose unit or form word (MG, TABLET, ORAL, etc.)
4. Strips the FDA 4-letter biosimilar suffix (`-adaz`, `-bwwd`, etc.) from the last token
5. Title-cases the result

Example: `"adalimumab-adaz 40 MG/0.4 ML subcutaneous solution"` → `"Adalimumab"`

This is used in Screen A to display a clean name in the "Current Regimen" card.

### 2d. Key FHIR extraction functions

All functions are in [src/modules/ibd/utils.ts](src/modules/ibd/utils.ts):

| Function | Returns | Used by |
|----------|---------|---------|
| `getAllIBDMedications(resources)` | All IBD-relevant `MedInfo[]` (any status) | Screen C (matching features), steroid exposure |
| `getCurrentRegimen(resources)` | Active medications sorted by class priority | Screen A current regimen card |
| `getSteroidExposure(resources)` | `{ totalCourses, activeCourses }` | Screen A left rail, Screen C matching chips |
| `getMedHistory(resources)` | Full `MedHistoryEntry[]` with start + end dates | General Timeline medication Gantt |

The class priority order for `getCurrentRegimen` is: biologic → immunomodulator → aminosalicylate → steroid → antibiotic.

### 2e. End date resolution for the general Timeline

`getMedHistory()` resolves medication duration using four strategies in priority order:

1. `dispenseRequest.validityPeriod.end` (exact)
2. `dosageInstruction[0].timing.repeat.boundsPeriod.end` (exact)
3. Derived from `timing.repeat.count × (period / frequency) × unitMs` (exact)
4. Drug-class heuristic fallback from `IBD_MED_DISPLAY_DAYS` (estimated)

Heuristic durations (days) when none of the above are available:

| Drug group | Fallback days |
|------------|--------------|
| Short steroids (prednisone, etc.) | 21 |
| Budesonide | 28 |
| Antibiotics | 14 |
| Immunomodulators | 365 |
| Aminosalicylates | 365 |
| Advanced therapies (biologics, JAK inhibitors) | 180 |

When a heuristic is used, `endIsExact: false` is set on the entry, and the general
Timeline Gantt renders these bars with a visual cue (tooltip note).

The same resolution logic is done independently by `medicationPeriod()` in
[src/components/Timeline/MedicationTimeline.tsx](src/components/Timeline/MedicationTimeline.tsx:21)
for the generic patient timeline view.

---

## 3. Screen A — Current regimen display

`getCurrentRegimen()` is called in Screen A with `selectedPatientResources` from
`PatientContext`. Active medications are shown in the "Current Regimen" summary card,
sorted by drug class. Each medication name is passed through `normalizeMedName()` before
display.

Steroid exposure is displayed in the left rail as a count: total prescriptions and
currently active ones, drawn from `getSteroidExposure()`.

The card is clickable and links to Screen B (Timelines).

---

## 4. CDS cohort API — day-aligned medication history

For the IBD-specific Gantt (MedTimeline) and cohort views, medications come from the
`/ibd/cohort` API response, not from FHIR. This data is structured as
`MedicationHistoryItem[]`:

```typescript
interface MedicationHistoryItem {
    drug:       string;       // generic drug name
    drug_class: DrugClass;    // biologic | immunomodulator | aminosalicylate | steroid | antibiotic | other
    start_day:  number;       // days relative to treatment decision point (day 0)
    end_day:    number;       // days relative to day 0
}
```

Day 0 is the current treatment decision point. Negative `start_day` values indicate
medications that were in use before the index treatment began (prior treatment history).

This day-aligned format lets all patients and cohort episodes be plotted on a shared
timeline axis without any date arithmetic in the frontend.

The medication history appears in two places in the API response:

- `present_patient.medication_history` — the present patient's history, aligned to their
  current decision point
- `episodes[].medication_history` — each matched cohort episode's history, aligned to
  that episode's decision point

---

## 5. MedTimeline — Treatment Trajectories Gantt

[src/modules/ibd/MedTimeline.tsx](src/modules/ibd/MedTimeline.tsx) renders a Highcharts
`xrange` (Gantt-style) chart with two sections: Present Patient and Matched Cohort.

### Present patient section

One row per unique drug name. If a drug has overlapping prescriptions, they are split into
multiple lanes using a greedy bin-packing algorithm (`splitIntoLanes()`). Lane splitting
ensures bars never visually overlap.

Each bar is colored by drug class using `IBD_MED_CLASS_COLORS`:

| Class | Color |
|-------|-------|
| biologic | `#0d6efd` (blue) |
| immunomodulator | `#6f42c1` (purple) |
| aminosalicylate | `#20c997` (teal) |
| steroid | `#fd7e14` (orange) |
| antibiotic | `#dc3545` (red) |
| other | `#adb5bd` (grey) |

Bars use a left-fade gradient: medications that ended before day 0 (pre-treatment
history) are rendered at 30% opacity; medications active at or after day 0 use 75%
opacity. This visually distinguishes prior history from the current treatment period.

### Matched cohort section

Each treatment arm in `treatment_distributions` is summarized as a single bar spanning
the **median** episode window (from the median of `min(start_day)` to the median of
`max(end_day)` across all episodes on that treatment). The bar color is determined by the
most common `drug_class` in the index period (`start_day >= 0`) across all episodes in
the group.

Row labels show: `{label} · {sfr}% SFR (n={count})`.

### SFR annotations

Dashed vertical lines are drawn above the chart (as SVG paths via the Highcharts render
event) at `median_days_to_sfr` for each treatment distribution. IQR bands are drawn for
the best-SFR treatment only.

### Time axis behavior

- Default view: centered on day 0, mirroring the post-day-0 extent on the left
- "Show full history" button: removes the extremes constraint to reveal all pre-treatment
  history
- Axis labels auto-switch between Days / Weeks / Months depending on the data span
- Zoom: mouse wheel; Pan: Shift + drag

---

## 6. Screen B — Candidate therapy selector

Screen B (Timelines) uses `treatment_distributions` from the cohort API to populate a
radio-button list of candidate therapies. The selected treatment drives which CRP
trajectory is shown in the chart. Medication history does not appear directly in this
view — the Gantt for individual episodes is on MedTimeline.

---

## 7. Screen C — Episode and aggregate views

### Episode mode

Each episode row in the roster shows: `treatment`, `outcome`, `days_to_outcome`, and
`similarity`. The episode detail panel (bottom-right) includes the episode's
`medication_history` rendered as a compact list.

`getAllIBDMedications(resources)` is called to build matching chips that describe the
present patient's medication context (e.g. "Prior biologic").

### Aggregate mode

The treatment comparison table shows per-treatment outcome rates from
`treatment_distributions`. No per-episode `medication_history` is available in aggregate
mode (`episodes: []`).

---

## 8. AI assistant tool — `get_medications`

The AI chat agent has a dedicated `get_medications` tool (defined in
[src/components/AI/fhir/tools.ts](src/components/AI/fhir/tools.ts:39)) that reads from
the in-memory FHIR store (`MedicationRequest` resources). It is the preferred tool for
any medication query because it returns a pre-shaped, token-efficient result without
requiring FHIRPath expressions.

Parameters:
- `activeOnly` (boolean, default `true`) — filter to `status === "active"` only
- `text` (string, optional) — case-insensitive substring filter on medication name

Result shape per medication:
```json
{
  "name":      "Ustekinumab",
  "status":    "active",
  "start":     "2023-04-15",
  "dose":      "90 mg",
  "route":     "Subcutaneous",
  "frequency": "Every 8 weeks",
  "reason":    "Crohn's disease",
  "code":      "1234567"
}
```

The same name resolution priority as the IBD module is used:
`medicationCodeableConcept.text` → `coding[0].display` → `medicationReference.display`.

Stop dates are explicitly excluded because `MedicationRequest` does not reliably encode
them in FHIR R4, and the system prompt instructs the LLM not to infer or guess them.

The `medication_list` UI component (embeddable in the LLM's markdown response) pulls live
data from the FHIR store automatically and does not require the LLM to call
`get_medications` first. The tool is reserved for cases where the LLM needs the actual
data in its context (to write prose, do comparisons, etc.).

---

## 9. Summary of data flows

```
EHR / FHIR Bundle
    └── PatientContext.selectedPatientResources
            ├── MedicationRequest[]
            │       ├── extractMedName()          → raw name string
            │       ├── classifyMedication()       → MedClass
            │       ├── normalizeMedName()         → display name
            │       ├── getCurrentRegimen()        → Screen A current regimen card
            │       ├── getSteroidExposure()       → Screen A left rail, Screen C chips
            │       ├── getAllIBDMedications()      → Screen C matching features
            │       └── getMedHistory()            → general Timeline Gantt
            └── AI FHIR store (same resources)
                    └── get_medications tool       → AI chat prose answers
                        medication_list component  → embedded UI widget

CDS backend /ibd/cohort
    └── useCohortData hook
            ├── present_patient.medication_history (day-aligned MedicationHistoryItem[])
            │       └── MedTimeline present patient Gantt rows
            └── episodes[].medication_history     (day-aligned MedicationHistoryItem[])
                    └── MedTimeline cohort Gantt rows
                        Screen C episode detail panel
```

---

## 10. Known limitations and design notes

- **Stop dates from FHIR are unreliable.** `MedicationRequest.status` is used to
  distinguish active from stopped medications, but the actual end date is often absent.
  The IBD module uses a priority chain of FHIR fields and falls back to clinical
  heuristics. The AI assistant is explicitly told not to infer stop dates.

- **Drug name variants.** The same biologic can appear as `"adalimumab"`,
  `"adalimumab-adaz"`, `"Humira 40 MG/0.4 ML"`, etc. `normalizeMedName()` handles this
  but only for display; `classifyMedication()` does a simple lowercase substring match
  which is sufficient for the known drug list but not for arbitrary names.

- **FHIR vs cohort API are separate data sets.** The FHIR `MedicationRequest` records
  come from the EHR and reflect the full raw prescribing history. The cohort API's
  `medication_history` is pre-processed by the CDS backend and day-aligned — it may
  contain a different subset of drugs (only index treatment context) and will not have
  the same records as FHIR. The frontend never tries to reconcile these two sources.

- **`other` class is dropped.** Any medication that does not match a known IBD drug class
  is silently excluded from all IBD views. Non-IBD medications (e.g. antihypertensives,
  antidepressants) will not appear in the current regimen card or the Gantt.

- **Duplicate config.** Drug name lists are defined in
  [src/modules/ibd/config.ts](src/modules/ibd/config.ts) and also partially duplicated
  in [src/components/Timeline/config.ts](src/components/Timeline/config.ts). The comment
  in `ibd/config.ts` notes the generic copies will be deprecated once the IBD module
  fully owns its configuration.

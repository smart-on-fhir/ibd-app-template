# LLM Tool Recommendations

Value is proportional to **coverage × precision × reliability**, not just variety.
The ceiling is set by tool coverage; the floor is set by description quality and loop robustness.

---

## Tier 1 — Core retrieval (~80% of clinical questions)

| Tool | Purpose |
|---|---|
| `get_patient_demographics` | Name, DOB, age, sex, identifiers |
| `get_conditions` | Active/historical problems; filter by status or code |
| `get_medications` | Active/stopped MedicationRequests with dosage |
| `get_observations` | Vitals, labs; filter by LOINC code or category (`vital-signs`, `laboratory`) |
| `get_immunizations` | With dates and status |
| `get_allergies` | AllergyIntolerance resources |

## Tier 2 — Encounter & care context

| Tool | Purpose |
|---|---|
| `get_encounters` | Recent visits, type, dates, provider |
| `get_procedures` | Surgical/diagnostic history |
| `get_care_plan` | Active goals and activities |

## Tier 3 — Precision tools (highest quality-per-token gains)

These are where the biggest quality improvements come from. The model *can* reason from raw
lists, but purpose-built denormalized tools are faster, cheaper, and less error-prone.

| Tool | Purpose |
|---|---|
| `get_latest_observation` | Single most-recent value for a given LOINC code — avoids the model sorting a list |
| `get_observation_trend` | Time-series `[{date, value}]` for one LOINC code, ready for trend analysis |
| `get_medications_by_condition` | Joins MedicationRequest to Condition by reference — LLM should not reason about FHIR references |

## Tier 4 — Meta / safety

| Tool | Purpose |
|---|---|
| `list_available_resource_types` | Tells the model what data is actually in the bundle; prevents hallucinated queries |
| `get_resource_by_id` | Escape hatch for following a FHIR reference by `resourceType/id` |

---

## Design Principles

- **Return pre-interpreted values** — e.g. `{ "value": 120, "unit": "mmHg" }` not raw FHIR.
  The model should not need to understand FHIR structure.
- **Include `count` and `as_of`** in every response so the model can accurately say "as of…".
- **Tool descriptions are critical** — the model selects tools based on the description alone.
  A poorly described tool is effectively invisible.
- **Orchestration loop robustness** — define how many tool-calling rounds are allowed, how
  errors surface back to the model, and whether the model can self-correct on empty results.
- **Narrow over broad** — a tool that returns only what the LLM needs reduces noise, token
  cost, and hallucination risk compared to a tool returning full FHIR resources.

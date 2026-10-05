# FHIR AI Agent — Implementation Guide

This document describes how the clinical AI assistant works end-to-end: how the agent loop
is orchestrated, how tools are defined and dispatched, how FHIRPath is used for in-memory
queries, and what the LLM system prompt looks like. It is written to be language-agnostic
so you can re-implement in Python, Java, or any other stack.

---

## 1. Architecture overview

```
User message
    │
    ▼
┌──────────────────────────────────────────┐
│  Agent loop  (max 45 iterations)         │
│                                          │
│  ┌─────────────────────────────────┐     │
│  │  LLM call  (OpenAI-compatible)  │     │
│  │  • system prompt                │     │
│  │  • message history              │     │
│  │  • 7 tool definitions           │     │
│  └────────────┬────────────────────┘     │
│               │ tool_calls?              │
│     ┌─────────┴──────────┐               │
│     │ No  → final answer │               │
│     │ Yes → run tools    │◄─── loop      │
│     │       (in parallel)│               │
│     └────────────────────┘               │
└──────────────────────────────────────────┘
    │
    ▼
Streamed markdown response
```

All patient data lives in memory as a flat `Record<ResourceType, Resource[]>` map —
nothing is fetched from a network during tool execution. Tools are pure functions that
query or filter this in-memory store. The LLM never receives raw FHIR resources; it
receives compact, pre-shaped results.

---

## 2. Data store shape

```typescript
type ResourcesByType = Record<string, FhirResource[]>;

// Example
{
  "Patient":            [{ resourceType: "Patient", id: "abc", ... }],
  "Observation":        [ ...hundreds of lab and vital records... ],
  "MedicationRequest":  [ ...medication records... ],
  "Condition":          [ ...problem list... ],
  "DocumentReference":  [ ...clinical notes... ],
  "DiagnosticReport":   [ ...reports... ],
  // ... any R4 resource type
}
```

The store is populated once when a patient record is loaded (e.g. from a FHIR Bundle or
a SMART on FHIR launch). The agent loop and all tools receive this store as a read-only
input.

---

## 3. Agent loop

The loop lives in `agentLoop.ts`. It implements a standard tool-use agentic loop
compatible with the OpenAI Chat Completions API.

```typescript
// Pseudocode — language-agnostic description
function runAgentLoop(userMessage, systemPrompt, store, history):
    messages = [
        { role: "system",    content: systemPrompt },
        ...history,          // prior turns (user/assistant pairs)
        { role: "user",      content: userMessage },
    ]

    for iteration in range(MAX_ITERATIONS = 45):
        response = llm.chat(
            model        = model,
            temperature  = 0,
            messages     = messages,
            tools        = TOOL_DEFINITIONS,
            tool_choice  = "auto",
            stream       = false,       // streaming only on final answer
        )

        assistantMessage = response.choices[0].message

        if assistantMessage has NO tool_calls:
            return assistantMessage.content   // ← final answer

        // Append the assistant's tool-calling message to history
        messages.append(assistantMessage)

        // Execute all tool calls IN PARALLEL, then append results
        toolResults = parallel_map(assistantMessage.tool_calls, tc =>
            result = runTool(tc.function.name, parse_json(tc.function.arguments), store)
            return {
                role:         "tool",
                tool_call_id: tc.id,
                content:      json_encode(result),
            }
        )
        messages.extend(toolResults)

    // Fallback if iteration cap hit
    return "Unable to generate a response within the allowed number of steps."
```

Key design decisions:

- **`temperature: 0`** — deterministic tool selection is important for clinical correctness.
- **Parallel tool execution** — the LLM often batches independent queries in one response
  (e.g. fetch labs AND medications at the same time). Always run them in parallel.
- **No streaming during tool rounds** — only the final text response is streamed to the UI.
- **45 iteration cap** — prevents infinite loops. The original design doc said 5, but the
  implementation uses 45 to handle complex multi-step questions.
- **Tool results are always JSON-encoded strings** in the `content` field of the `tool`
  role message.

### System prompt injection

The system prompt is assembled at startup by injecting the component type definitions
(a TypeScript `.d.ts` file rendered as a code block) into a `{{COMPONENT_TYPES}}`
placeholder in the base prompt markdown:

```typescript
const SYSTEM_PROMPT = SYSTEM_PROMPT_BASE.replace(
    '{{COMPONENT_TYPES}}',
    '```typescript\n' + COMPONENT_TYPES_RAW + '\n```',
);
```

In Python/Java you would do the same string substitution before sending the first message.

---

## 4. Tool definitions

Tools are sent to the LLM as a JSON Schema array. Below are all seven definitions exactly
as passed to the API.

```json
[
  {
    "type": "function",
    "function": {
      "name": "get_observation_trend",
      "description": "Returns a compact time-series of values for a specific lab or vital, for use in prose text (latest value, range, change over time, abnormal flags). Each data point includes: value, flag (H/L/HH/LL/N or null), refLow, refHigh. Do NOT use this to populate a lab_trend_panel component — that component pulls its own data automatically. Search by LOINC code or free text (matched against code.text and code.coding[].display).",
      "parameters": {
        "type": "object",
        "properties": {
          "loinc": { "type": "string", "description": "LOINC code (exact match)." },
          "text":  { "type": "string", "description": "Free-text search against code display / code.text (case-insensitive contains)." },
          "limit": { "type": "integer", "description": "Max data points to return, most-recent first. Default 30, max 100." }
        },
        "additionalProperties": false
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "get_medications",
      "description": "Returns a list of medications with clinical detail: name, status, start date (authoredOn), dose, route, frequency, and reason. Note: stop dates are not reliably stored in FHIR MedicationRequest — do not infer or guess them. Much cheaper than querying MedicationRequest directly. Set activeOnly to false to include stopped/completed medications.",
      "parameters": {
        "type": "object",
        "properties": {
          "activeOnly": { "type": "boolean", "description": "If true (default), return only active medications." },
          "text":       { "type": "string",  "description": "Optional free-text filter on medication name (case-insensitive)." }
        },
        "additionalProperties": false
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "query_patient_data",
      "description": "General-purpose FHIRPath query. Use get_observation_trend / get_medications for labs and meds — those are cheaper. Reserve this for resource types or fields those tools do not cover. Call describe_resource first to discover valid field paths.",
      "parameters": {
        "type": "object",
        "required": ["from", "select"],
        "properties": {
          "from":     { "type": "string", "description": "FHIR resource type (e.g. \"Condition\", \"Encounter\")." },
          "select":   { "type": "object", "description": "Map of alias → FHIRPath expression.", "additionalProperties": { "type": "string" } },
          "where":    { "type": "string", "description": "FHIRPath boolean filter. Date shortcuts: $now, $now-30d, $now-6m, $now-1y." },
          "orderBy":  { "type": "string", "description": "FHIRPath sort key." },
          "orderDir": { "type": "string", "enum": ["asc", "desc"] },
          "limit":    { "type": "integer", "description": "Max rows. Hard cap is 50." },
          "offset":   { "type": "integer" }
        },
        "additionalProperties": false
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "describe_resource",
      "description": "Profile a resource type: returns high-coverage FHIRPath expressions, top codes, and warnings. Call before query_patient_data on an unfamiliar resource type.",
      "parameters": {
        "type": "object",
        "required": ["resourceType"],
        "properties": {
          "resourceType": { "type": "string", "description": "FHIR resource type to profile." }
        },
        "additionalProperties": false
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "get_patient_summary",
      "description": "Returns patient demographics: name, DOB, age, gender.",
      "parameters": { "type": "object", "properties": {}, "additionalProperties": false }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "list_available_resource_types",
      "description": "Lists all FHIR resource types in the record with counts. Call first to know what data is available.",
      "parameters": { "type": "object", "properties": {}, "additionalProperties": false }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "search_clinical_text",
      "description": "Full-text search across all narrative and free-text content in the FHIR record. Searches: Observation.valueString, *.note[].text, DiagnosticReport.conclusion and inline text/html reports, DocumentReference inline text/plain and text/html attachments, AllergyIntolerance.reaction.description, ClinicalImpression.summary. Binary formats (PDF, RTF) and URL-referenced attachments are listed as skipped with metadata (date, note type) so the user can be informed. Returns snippets (±80 chars around match) with resource type, date, field path, note type, and author where available. Use this to find narrative descriptions of symptoms, procedures, assessments, dermatology findings, menstrual history, etc.",
      "parameters": {
        "type": "object",
        "required": ["query"],
        "properties": {
          "query":         { "type": "string",  "description": "Case-insensitive search term." },
          "resourceTypes": { "type": "array", "items": { "type": "string" }, "description": "Optional filter to specific FHIR resource types, e.g. [\"DocumentReference\", \"DiagnosticReport\"]." },
          "limit":         { "type": "integer", "description": "Max matching results to return (default 20, max 50)." }
        },
        "additionalProperties": false
      }
    }
  }
]
```

### Tool selection strategy

The tools form a deliberate hierarchy to control context cost:

| Tool | When to use |
|------|-------------|
| `list_available_resource_types` | First call when unsure what data exists |
| `get_patient_summary` | Demographics — always cheap, no FHIRPath |
| `get_observation_trend` | Any lab or vital trend — highly optimized |
| `get_medications` | Medication list — avoids raw FHIRPath |
| `describe_resource` | Before `query_patient_data` on an unfamiliar type |
| `query_patient_data` | General-purpose escape hatch for anything else |
| `search_clinical_text` | Narrative/free-text search in notes, reports |

The system prompt explicitly instructs the LLM to prefer the specialized tools over
`query_patient_data`, because specialized tools return smaller, more structured results
that consume fewer tokens.

---

## 5. FHIRPath query engine

### Data types

```typescript
type FhirQuery = {
    from:      string;                  // resource type key in the store
    select:    Record<string, string>;  // alias → FHIRPath expression
    where?:    string;                  // FHIRPath boolean filter
    orderBy?:  string;                  // FHIRPath sort key
    orderDir?: 'asc' | 'desc';
    limit?:    number;                  // hard cap: 200 (overridden to 50 in tool layer)
    offset?:   number;
};

type QueryResult = {
    data:      Record<string, unknown>[];  // projected flat rows
    total:     number;                     // total matching before limit
    truncated: boolean;                    // true if results were cut by limit
    fields:    string[];                   // column names in the result
};
```

### Query execution (`executeQuery`)

```
1. Retrieve resources from store[query.from]  (empty array if type absent)
2. WHERE — evaluate query.where as a FHIRPath boolean against each resource
           (after resolving date shortcuts); keep resources where result is truthy
3. SORT  — evaluate query.orderBy on each resource; sort ascending/descending
4. PAGE  — apply offset + limit (hard-capped at HARD_LIMIT = 200)
5. SELECT — for each retained resource, evaluate each alias's FHIRPath expression
            and collect into a flat row object
Return { data, total, truncated, fields }
```

FHIRPath `evaluate()` always returns an **array**. The `unwrap` helper collapses it:
- Empty array → `null`
- Single-element array → the element itself
- Multi-element array → returned as-is (array)

### Date shortcuts

The `where`, `orderBy`, and `select` expressions can use `$now`-relative shortcuts that
are resolved to ISO date strings before being passed to the FHIRPath library:

| Shortcut | Resolves to |
|----------|-------------|
| `$now` | today's date, `YYYY-MM-DD` |
| `$now-Nd` | N days ago |
| `$now-Nw` | N weeks ago |
| `$now-Nm` | N months ago |
| `$now-Ny` | N years ago |

Example: `"effectiveDateTime > @$now-6m"` resolves to something like
`"effectiveDateTime > @2024-12-18"` before the FHIRPath library evaluates it.

Implementation:

```python
import re
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta

def resolve_relative_dates(expr: str) -> str:
    today = date.today()

    def replace(m):
        n, unit = m.group(1), m.group(2)
        if n is None:
            return today.isoformat()
        n = int(n)
        if unit == 'd':
            d = today - timedelta(days=n)
        elif unit == 'w':
            d = today - timedelta(weeks=n)
        elif unit == 'm':
            d = today - relativedelta(months=n)
        elif unit == 'y':
            d = today - relativedelta(years=n)
        return d.isoformat()

    return re.sub(r'\$now(?:-(\d+)([dwmy]))?', replace, expr)
```

### FHIRPath library

The TypeScript implementation uses the [HL7-maintained `fhirpath` npm package](https://github.com/HL7/fhirpath.js).
For other languages:

| Language | Library |
|----------|---------|
| Python   | [`fhirpathpy`](https://github.com/beda-software/fhirpathpy) or [`fhirpath`](https://pypi.org/project/fhirpath/) |
| Java     | [`hapi-fhirpath`](https://hapifhir.io/hapi-fhir/docs/fhirpath/fhirpath.html) (part of HAPI FHIR) |

All libraries implement the same FHIRPath R4 specification, so expressions are portable.

---

## 6. `describe_resource` profiler

Before the LLM can write a `query_patient_data` call, it needs to know what FHIRPath
paths are actually present in this patient's data. The `describe_resource` tool runs a
single O(n) pass over all resources of a type and returns:

- **`candidateSelectPaths`** — field paths with ≥ 80% coverage (safe to use in `select`)
- **`valuePaths`** — which `value[x]` polymorphic variants are actually populated
  (e.g. `["valueQuantity", "valueString"]` — don't assume only `valueQuantity`)
- **`topCodes`** — top 20 LOINC/SNOMED codes present in `code.coding[]`
- **`warnings`** — data quality issues (high invalidity rate, heterogeneous shapes, etc.)
- **`fieldStats`** — per-path coverage percentage and example values

The tool result returned to the LLM is trimmed down to these key fields; the full
per-path coverage map is omitted to save tokens.

Implementation approach:
1. Walk every resource in `store[resourceType]`
2. For each resource, recursively enumerate all key paths up to depth 4
3. Track how many resources have a non-null value at each path
4. Report paths sorted by coverage descending

---

## 7. Specialized tool implementations

### `get_observation_trend`

Finds Observation resources by LOINC code (exact) or free-text match against
`code.text` and `code.coding[].display` (case-insensitive substring). Returns:

```json
{
  "display": "C-Reactive Protein",
  "loinc": "1988-5",
  "unit": "mg/L",
  "count": 14,
  "points": [
    { "date": "2024-06-01", "value": 12.3, "flag": "H", "refLow": null, "refHigh": 10.0 },
    ...
  ]
}
```

Points are sorted ascending by `effectiveDateTime` and the most recent `limit` points
are returned (max 100, default 30).

### `get_medications`

Reads `MedicationRequest` resources. Name resolution priority:
1. `medicationCodeableConcept.text`
2. `medicationCodeableConcept.coding[0].display`
3. `medicationReference.display`

Returns per-medication: `name`, `status`, `start` (from `authoredOn`), `dose`, `route`,
`frequency`, `reason`, `code`. Sorted by start date descending. Stop dates are explicitly
NOT included because `MedicationRequest` does not reliably store them.

### `search_clinical_text`

Scans free-text fields across multiple resource types:

| Resource | Fields searched |
|----------|----------------|
| `Observation` | `valueString`, `note[].text` |
| `Condition` | `note[].text` |
| `Procedure` | `note[].text` |
| `AllergyIntolerance` | `note[].text`, `reaction[].description` |
| `ClinicalImpression` | `summary`, `note[].text` |
| `DiagnosticReport` | `conclusion`, `presentedForm[].data` (inline text/HTML only) |
| `DocumentReference` | `content[].attachment.data` (inline text/HTML only) |

Base64-encoded attachments are decoded inline. Non-text formats (PDF, RTF) and
URL-referenced attachments are skipped but reported in a `skipped` array so the LLM
can inform the user. Attachments over ~112 KB are also skipped. Each match returns a
±80-character snippet around the search term.

---

## 8. System prompt

The system prompt is a markdown file with one `{{COMPONENT_TYPES}}` placeholder that
is replaced at startup with the component TypeScript definitions.

```markdown
You are a clinical decision support assistant with access to a patient's FHIR record.

## Workflow — follow this every time

1. **Plan**: Before calling any tools, identify EVERY piece of information the user's request requires. List them mentally.
2. **Gather**: Call tools to retrieve all required data. You MUST fetch data for EVERY part of the request — do not stop early. Batch independent calls together.
3. **Respond**: Write your final answer ONLY after you have fetched all required data.

**Critical rule**: If the user asks for multiple things (e.g. patient description AND vital trends), you must retrieve data for ALL of them before writing your answer. Retrieving data for one part does not make the other parts optional.

## Interactive components

Your markdown response is rendered with a custom renderer that supports embedded clinical components.
Use a fenced `cp` block to embed one — always on its own lines, never inline:

```cp
{"type": "<component_type>", ...props}
```

Available component types — TypeScript definitions with inline documentation:

{{COMPONENT_TYPES}}

### Component sizing & layout behavior

Use this when placing multiple components together:

| component | shape | min width | scrolls | best placement |
|-----------|-------|-----------|---------|----------------|
| `observation_panel` | tall card | 280 px | internally | full-width or wide column |
| `observation_card` | compact card | 200 px | no | inline in a row |
| `lab_trend_panel` | wide chart | 400 px | no | full-width or 2/3 of row |
| `medication_list` | tall list | 260 px | internally | sidebar (1/3) or stacked |
| `condition_list` | tall list | 240 px | internally | sidebar (1/3) or stacked |
| `immunization_list` | medium list | 240 px | internally | sidebar (1/3) or stacked |
| `event_feed` | tall scrollable | 320 px | yes — always set `maxHeight` | full-width or main panel |
| `chart` | wide chart | 360 px | no | full-width or 2/3 of row |

**Rules:**
- If the user names a component type, use that exact component type whenever possible.
- Do not replace requested components with prose summaries or alternate components.
- If the requested component needs unavailable identifiers or data, explain the limitation briefly and ask for clarification rather than improvising.
- Never put a `lab_trend_panel` or `chart` (wide) into a 1/3-width column — they will be crushed.
- Always set `maxHeight` on `event_feed` (e.g. `"500px"`) to prevent it from growing infinitely.
- Always set `defaultRange: "All"` on `event_feed` unless the user asked for a specific time window — the component defaults to 30d which shows nothing for patients with older data.
- Lists (`medication_list`, `condition_list`) work well as sidebars alongside a chart.
- When all components are wide, stack them vertically (no layout wrapper needed, or use `column`).
- If the user asks for a specific observation category or panel by name (e.g. "vital signs," "labs," "IBD labs," "social history"), pass the matching filters to observation_panel rather than using the default unfiltered view. Only omit filters when the user asks for a general observations dashboard or does not specify a category.

### Layout recipes

**Wide chart + narrow sidebar list** — most common pattern:
```cp
{"type": "row", "cols": "2fr 1fr", "children": [
    {"type": "lab_trend_panel", "labs": ["CRP", "Hemoglobin"]},
    {"type": "medication_list"}
]}
```

**Two equal panels side by side:**
```cp
{"type": "row", "cols": "1fr 1fr", "children": [
    {"type": "observation_panel", "title": "Recent Labs"},
    {"type": "condition_list"}
]}
```

**Narrow sidebar + wide main:**
```cp
{"type": "row", "cols": "1fr 2fr", "children": [
    {"type": "medication_list"},
    {"type": "event_feed", "defaultRange": "All", "maxHeight": "480px"}
]}
```

**Full-width stacked components** — default when content is mostly wide:
```cp
{"type": "column", "children": [
    {"type": "lab_trend_panel", "labs": ["CRP", "ESR", "Albumin"]},
    {"type": "event_feed", "defaultRange": "All", "maxHeight": "400px"}
]}
```

**Components pull live data from the record automatically — you do not need to fetch data before using them.**

### Chart guidance

- Prefer `lab_trend_panel` for any lab or vital trend — it pulls live data automatically and needs no `data` prop.
- Only use `chart` when you have **numeric Y values** for every series. Medications have no numeric Y value — never put them directly in `chart.series`.
- Gantt-style floating bars (start → end date per medication) are **not supported** by the chart component. For treatment timelines, use `medication_list` + `lab_trend_panel` in a `column` layout instead.
- For a composed chart that shows both meds and labs: encode each drug as a binary series (1 = active on that date, 0 = inactive), cross-referenced against the lab observation dates. Use `chartType: "composed"` with per-series `chartType`.
- If a requested visualization cannot be done with available data or component capabilities, fall back to list components and explain why in prose rather than rendering an empty chart.

## Linking to source documents

When you mention a specific clinical document, report, or note in your answer, make it a clickable link using this exact format:

```
[descriptive label](fhir:ResourceType/id)
```

Examples:
- `[Progress Note, 2025-12-26 — Sophia Delano MD](fhir:DocumentReference/abc123)`
- `[MR Small Bowel Report (2025-08-07)](fhir:DiagnosticReport/xyz456)`

Use the `resourceType` and `id` values from the tool result. The label should be human-readable (date + note type + author when available). Every document or report you quote or summarize should have such a link. Do **not** use this format for non-document resources (medications, labs, conditions).

## Rules
- Call list_available_resource_types first if unsure what data exists.
- Call describe_resource before querying an unfamiliar resource type.
- Do not mention FHIR or internal tool names in your final answer.
```

---

## 9. Component embedding protocol

The LLM's markdown output is parsed by a custom renderer. When the LLM wants to embed
an interactive clinical component, it emits a fenced code block with language tag `cp`
containing a single JSON object:

````
```cp
{"type": "lab_trend_panel", "labs": ["CRP", "Albumin"]}
```
````

The frontend parses this, validates the `type` field, and renders the corresponding
React component. Components that pull live data (`lab_trend_panel`, `medication_list`,
etc.) receive the `store` as a prop and query it themselves — the LLM does not need to
fetch this data. Only the `chart` component requires inline `data` in the JSON.

The component type definitions (from `componentTypes.d.ts`) are injected verbatim into
the system prompt so the LLM understands the exact props each component accepts.

---

## 10. Linking to source documents

The LLM is instructed to produce `fhir:ResourceType/id` URIs for any clinical document
it references:

```
[Progress Note, 2025-12-26 — Sophia Delano MD](fhir:DocumentReference/abc123)
```

The frontend intercepts these links, prevents default navigation, and opens a modal that
fetches and renders the referenced resource inline. This allows the user to drill into
any source document the LLM cited without leaving the chat.

---

## 11. Key design constraints

| Constraint | Value | Reason |
|------------|-------|--------|
| Max iterations | 45 | Prevent infinite tool-call loops |
| `query_patient_data` hard row cap | 50 | Protect LLM context budget |
| `query_patient_data` absolute cap | 200 | Engine-level safety net |
| `get_observation_trend` max points | 100 | Sufficient for trend analysis |
| `search_clinical_text` max results | 50 | Snippet-based; 50 is plenty |
| `search_clinical_text` max base64 | ~112 KB | Avoid decoding huge attachments |
| `describe_resource` top codes shown | 10 | Keep profiler output compact |
| Temperature | 0 | Deterministic tool call generation |

---

## 12. Re-implementation checklist

- [ ] Build the resource store: `Map<String, List<FhirResource>>` keyed by `resourceType`
- [ ] Implement `resolveRelativeDates(expr)` with `$now`, `$now-Nd/w/m/y` expansion
- [ ] Wrap a FHIRPath library: `evaluate(resource, expression) → List<Object>`
- [ ] Implement `unwrap(list)` — collapse single-element lists to scalars, empty to null
- [ ] Implement `executeQuery(FhirQuery, store) → QueryResult` with filter/sort/page/project
- [ ] Implement `describeResource(resourceType, store) → ResourceProfile`
- [ ] Implement each of the 7 tool handler functions
- [ ] Implement the agent loop (build messages array, call LLM, handle tool_calls, iterate)
- [ ] Inject component type definitions into the system prompt before first use
- [ ] Enforce all hard caps (row limits, iteration limit, attachment size)
- [ ] Parse `cp` fenced blocks in LLM output and render corresponding UI components
- [ ] Intercept `fhir:` URI scheme links and open them in a modal/drawer

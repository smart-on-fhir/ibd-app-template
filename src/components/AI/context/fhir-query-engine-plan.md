# FHIR Query Engine Plan

## Overview
React/TS SPA with in-memory FHIR data (`Record<string, object[]>`) queried by an LLM
via tool calling. LLM receives only minimal necessary data to answer user questions.

---

## Query API Design (Option A: thin JSON envelope + FHIRPath expressions)

```json
{
    "from":    "Observation",
    "select":  {
        "name":  "code.coding.where(system='http://loinc.org').display",
        "value": "value.ofType(Quantity).value",
        "unit":  "value.ofType(Quantity).unit",
        "date":  "effectiveDateTime",
        "low":   "referenceRange.first().low.value",
        "high":  "referenceRange.first().high.value"
    },
    "where":   "effectiveDateTime > @2016-01-01 and referenceRange.exists()",
    "orderBy": "effectiveDateTime",
    "orderDir": "desc",
    "limit":   50,
    "offset":  0
}
```

- `from`: resource type key into the store
- `select`: map of alias → FHIRPath expression (projected into flat row)
- `where`: single FHIRPath boolean expression (`fhirpath.evaluate(r, expr)` → test truthy)
- `orderBy`: FHIRPath expression for sort key
- `orderDir`: `"asc"` | `"desc"`
- `limit` / `offset`: pagination (enforce hard cap, e.g. 200)

### Result envelope
```ts
type QueryResult = {
    data:      Record<string, unknown>[];
    total:     number;       // total matching before limit
    truncated: boolean;      // whether limit cut results
    fields:    string[];     // keys present in returned rows
}
```

---

## Tools exposed to the LLM

1. **`query_patient_data`** — runs the query above
2. **`describe_resource`** — returns fields actually present in sampled resources (helps LLM pick correct FHIRPath paths for this specific patient)
3. **`get_patient_summary`** — returns age, gender, birthDate, name directly (no query needed)

---

## Query Engine Implementation Notes

- Library: `fhirpath` (npm: `fhirpath`, HL7-maintained)
- `$now-10y` / `$now-6m` / `$now-30d` syntax: pre-process before passing to fhirpath
- FHIRPath `evaluate()` always returns array — unwrap single values, null if empty
- Enforce hard `limit` cap (200) regardless of what LLM requests
- `describe_resource`: sample first 5 resources, walk actual fields, report which FHIRPath expressions resolve to non-null values

---

## LLM Orchestration Loop

```
User message (no patient data)
    ↓
LLM responds with tool calls (possibly multiple in parallel)
    ↓
App runs queries locally via fhirpath engine
    ↓
Results appended to message history
    ↓
Loop (max 5 iterations or token budget)
    ↓
LLM generates final markdown response
```

- Max iterations: 5
- LLM can batch independent queries in a single response (run with `Promise.all`)
- If max iterations hit: resend without `tools` to force final synthesis
- Stream the final text response; tool call round-trips are non-streaming

---

## Key Risks / Mitigations

| Risk | Mitigation |
|------|-----------|
| LLM guesses wrong field paths | `describe_resource` tool + FHIR field hints in system prompt |
| Unbounded result size | Hard 200-row cap + `truncated` flag in result |
| Infinite tool-call loop | Max iteration count + token budget tracking |
| FHIR date format inconsistency | Pre-process `$now-Xy` to ISO strings; handle YYYY/YYYY-MM/full ISO |
| Cross-resource joins | Out of scope for v1 |

---

## Files to Create

- `src/fhir/types.ts` — `FhirQuery`, `QueryResult` types
- `src/fhir/queryEngine.ts` — core `executeQuery` function
- `src/fhir/fhirpathUtils.ts` — date resolution, value unwrapping helpers
- `src/fhir/tools.ts` — tool definitions (JSON Schema for LLM) + `runTool` dispatcher
- `src/fhir/agentLoop.ts` — orchestration loop (messages array management, iteration control)

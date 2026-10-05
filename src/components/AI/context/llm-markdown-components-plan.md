# LLM Markdown + React Component Augmentation Plan

## Overview
LLM responses are markdown, augmented with whitelisted React components embedded as
fenced code blocks. Components receive only scalar props — no functions, no object refs.
`StaticComponent.tsx` already implements the dispatcher pattern.

---

## Embedding Format — Fenced Code Blocks

LLM emits standard markdown with `component` language tag for interactive blocks:

````markdown
Here are the patient's current medications:

```component
{"type":"medication_list","maxItems":5}
```

Active conditions sorted by onset:

```component
{"type":"condition_list","onsetAfter":"2015-01-01"}
```
````

**Why this format:**
- LLMs are highly reliable at emitting fenced code blocks
- Clean fallback: renders as a code block if parsing fails
- Easy to intercept with `react-markdown` custom renderer
- No ambiguity with regular markdown

---

## Markdown Renderer Integration

Using `react-markdown`, override the `code` component:

```tsx
import ReactMarkdown from "react-markdown";
import StaticComponent from "./components/StaticComponent";

<ReactMarkdown
    components={{
        code({ className, children }) {
            if (className === "language-component") {
                return <StaticComponent instruction={String(children).trim()} />;
            }
            return <code className={className}>{children}</code>;
        }
    }}
>
    {llmResponse}
</ReactMarkdown>
```

---

## `StaticComponent` — Current State

Already implemented in `src/components/StaticComponent.tsx`:
- Accepts `instruction: string | Instruction`
- Parses JSON string if needed
- Handles arrays (maps to multiple components)
- Dispatches on `type` to whitelisted wrapper components
- Shows error UI on invalid input

**Currently registered types:**
- `medication_list` → `MedicationListWrapper`
- `condition_list` → `ConditionListWrapper`
- `immunization_list` → `ImmunizationListWrapper`
- `text` → plain text content

**Commented out (future):**
- `observation_card`, `observation_panel`, `lab_trend_panel`, `column`, `row`

---

## Instruction Type Constraint — Scalar-Only Props

Tighten the `Instruction` type to enforce no nested objects:

```ts
type ScalarValue = string | number | boolean | null;
type Instruction = {
    type: string;
} & Record<string, ScalarValue | ScalarValue[]>;
```

Validate on parse — reject instructions containing nested objects. Components should
derive complex data themselves from the FHIR store, not receive it as props.

---

## LLM System Prompt — Component Whitelist

The system prompt must include a compact schema of available components so the LLM
knows what to generate. Keep it concise — one entry per component:

```
Available components (embed as ```component JSON blocks):

- medication_list: { maxItems?: number, onsetAfter?: string (ISO date) }
- condition_list:  { maxItems?: number, onsetAfter?: string (ISO date) }
- immunization_list: { maxItems?: number }

Only use scalar values (string, number, boolean). Do not include nested objects.
```

Update this section whenever a new component type is registered in StaticComponent.

---

## Files Involved

- `src/components/StaticComponent.tsx` — dispatcher (partially done)
- `src/components/Condition/ConditionList.tsx` — `ConditionListWrapper`
- `src/components/Medication/MedicationList.tsx` — `MedicationListWrapper`
- `src/components/Immunization/ImmunizationList.tsx` — `ImmunizationListWrapper`
- Markdown renderer — wherever `llmResponse` is rendered (TBD)

---

## TODO

- [ ] Tighten `Instruction` type to scalar-only
- [ ] Wire `StaticComponent` into the markdown renderer (`code` override)
- [ ] Write component whitelist section for LLM system prompt
- [ ] Add validation that rejects nested objects in instruction props
- [ ] Decide error UX: silent fallback vs. visible error block

// ─── Layout ───────────────────────────────────────────────────────────────────

/** Stack children side-by-side using CSS grid.
 *  Never place a wide component (lab_trend_panel, chart) in a column narrower than 1/3. */
interface RowProps {
    type: "row";
    /** CSS grid-template-columns, e.g. "2fr 1fr" or "1fr 1fr 1fr".
     *  Omit for a single equal-width column per child. */
    cols?: string;
    gap?: string | number;
    children: ComponentProps | ComponentProps[];
}

/** Stack children vertically. */
interface ColumnProps {
    type: "column";
    gap?: string | number;
    children: ComponentProps | ComponentProps[];
}

// ─── Observations ─────────────────────────────────────────────────────────────

/** Scrollable panel of observation cards grouped by concept, with filter tabs.
 *  Pulls live data — no fetching needed. min-width: 280 px; scrolls internally. */
interface ObservationPanelProps {
    type: "observation_panel";
    title?: string;
    /** Omit entirely to get the smart "Latest" default tab — best for general use.
     *  Only pass when the user explicitly asks to restrict to a specific category.
     *  Note: passing a single filter collapses to a tabless view of that one category. */
    filters?: Array<"All" | "Vitals" | "Labs" | "IBD" | "Social" | "Activity">;
}

/** Single observation card, looked up by FHIR resource id. min-width: 200 px. */
interface ObservationCardProps {
    type: "observation_card";
    observationId: string;
}

// ─── Lab trends ───────────────────────────────────────────────────────────────

/** Valid keys for LabTrendPanelProps.labs.
 *  Use ONLY these identifiers — never use FHIR display names or free text. */
type LabTrendKey =
    // Vitals
    | "Weight" | "Height" | "BMI" | "HeartRate" | "OxygenSat"
    | "Temperature" | "RespRate" | "BloodPressure"
    // IBD labs
    | "CRP" | "ESR" | "Albumin" | "Calprotectin" | "Hemoglobin"
    | "Platelets" | "PreAlbumin" | "PCT" | "Ferritin"
    // CBC
    | "WBC" | "RBC" | "Hematocrit" | "MCV" | "MCH" | "MCHC" | "RDW"
    | "Neutrophils" | "Lymphocytes" | "Monocytes" | "Eosinophils" | "Basophils" | "MPV"
    // Other
    | "VitaminD" | "VitaminB12" | "ALT" | "AST";

/** Trends one or more labs or vitals over time.
 *  Pulls live data — no fetching needed. min-width: 400 px. */
interface LabTrendPanelProps {
    type: "lab_trend_panel";
    title?: string;
    labs: LabTrendKey[];
}

// ─── Lists ────────────────────────────────────────────────────────────────────

/** Current active medications. Pulls live data. min-width: 260 px; scrolls internally. */
interface MedicationListProps {
    type: "medication_list";
    title?: string;
}

/** Active problem list / conditions. Pulls live data. min-width: 240 px; scrolls internally. */
interface ConditionListProps {
    type: "condition_list";
    title?: string;
}

/** Immunization history. Pulls live data. min-width: 240 px. */
interface ImmunizationListProps {
    type: "immunization_list";
    title?: string;
}

// ─── Event feed ───────────────────────────────────────────────────────────────

/** Chronological feed of all clinical events (labs, meds, notes, procedures, etc.).
 *  Pulls live data. min-width: 320 px; always scrolls — always set maxHeight.
 *  Default range is 30d which will show nothing for most patients — always set defaultRange: "All". */
interface EventFeedProps {
    type: "event_feed";
    title?: string;
    /** ALWAYS set to "All" unless the user explicitly asked for a specific time window. */
    defaultRange?: "7d" | "30d" | "90d" | "All";
    /** Omit to show all event types. Only pass when the user asks to filter by type. */
    includeTypes?: Array<"lab" | "vitals" | "alert" | "med" | "note" | "procedure" | "immunization">;
    /** Required — prevents infinite growth, e.g. "500px". */
    maxHeight: string | number;
}

// ─── Chart ────────────────────────────────────────────────────────────────────

/** bar = horizontal bars; column = vertical bars */
type ChartType =
    | "line" | "area" | "bar" | "column" | "scatter"
    | "pie" | "radar" | "radialBar" | "funnel" | "treemap" | "composed";

interface ChartSeries {
    key: string;
    name?: string;
    color?: string;
    data?: object[];
    /** Per-series chart type override for composed charts */
    chartType?: "line" | "area" | "bar";
}

interface ChartSlice {
    name: string;
    value: number;
    color?: string;
}

/** Custom chart rendered from inline data.
 *  Only use when you have numeric Y values for every series.
 *  Prefer lab_trend_panel for any lab or vital trend.
 *  min-width: 360 px; do not place in a narrow column.
 *
 *  Patterns:
 *  - Single-series XY:          data + xKey + yKey
 *  - Pre-pivoted multi-series:  data + xKey + series[]
 *  - Split flat data by field:  data + xKey + yKey + stratifyBy
 *  - Pie / funnel / radialBar:  slices[], or data + xKey + yKey (slices derived)
 *  - Composed:                  series[] where each entry has chartType
 */
interface ChartProps {
    type: "chart";
    chartType: ChartType;
    data?: object[];
    xKey?: string;
    yKey?: string;
    series?: ChartSeries[];
    stratifyBy?: string;
    slices?: ChartSlice[];
    height?: number;
    colors?: string[];
    showLegend?: boolean;
    showGrid?: boolean;
    xLabel?: string;
    yLabel?: string;
}

// ─── Finding card ─────────────────────────────────────────────────────────────

type EvidenceLabItem = {
    kind: 'lab' | 'vital';
    name: string;
    value: string;
    unit?: string;
    /** Secondary label, e.g. reference range or collection date */
    sub?: string;
    flag?: 'high' | 'low' | 'critical';
};

type EvidenceMedItem = {
    kind: 'med';
    name: string;
    note?: string;
    tag?: string;
    tagVariant?: 'warning' | 'success' | 'danger' | 'muted' | 'info';
};

type EvidenceConditionItem = {
    kind: 'condition';
    name: string;
    onset?: string;
    status?: string;
};

type EvidenceImagingItem = {
    kind: 'imaging';
    title: string;
    date?: string;
    conclusion?: string;
};

type EvidenceNoteItem = {
    kind: 'note';
    /** Can be a markdown, including a fhir: scheme link like [Patient](fhir:Patient/123) */
    title: string;
    date?: string;
    /** Can also be a markdown, and can include fhir links like [Patient](fhir:Patient/123) */
    category?: string;
    /** Can also be a markdown, and can include fhir links like [Patient](fhir:Patient/123) */
    snippet?: string;
};

type EvidenceNarrativeItem = {
    kind: 'narrative';
    /** Free-text explanation or supporting passage. Can also be a markdown, and can include fhir links like [Patient](fhir:Patient/123) */
    text: string;
};

type EvidenceCohortItem = {
    kind: 'cohort';
    description: string;
    /** Population size */
    n?: number;
    /** Highlighted statistic, e.g. "34% risk of AKI requiring dialysis" */
    stat?: string;
};

type EvidenceScoreItem = {
    kind: 'score';
    name: string;
    total?: string;
    components?: { label: string; value: string }[];
};

type EvidenceItem =
    | EvidenceLabItem
    | EvidenceMedItem
    | EvidenceConditionItem
    | EvidenceImagingItem
    | EvidenceNoteItem
    | EvidenceNarrativeItem
    | EvidenceCohortItem
    | EvidenceScoreItem;

type EvidenceTab = {
    label: string;
    items: EvidenceItem[];
};

/**
 * Structured clinical finding card with concern level, confidence, and
 * tabbed evidence supporting the finding.
 *
 * Populate evidenceTabs with whatever evidence you retrieved:
 * labs/vitals → EvidenceLabItem, active meds → EvidenceMedItem,
 * imaging conclusions → EvidenceImagingItem, free-text reasoning → EvidenceNarrativeItem, etc.
 * Mix item kinds freely within a single tab.
 */
interface FindingCardProps {
    type: "finding_card";
    /** What is the finding — one concise sentence */
    title: string;
    /** One or two sentences expanding on the finding */
    description?: string;
    /** Defaults to "low" */
    concernLevel?: 'low' | 'moderate' | 'high';
    /** Float 0–1. Omit if you cannot estimate confidence. */
    confidenceLevel?: number;
    /** Evidence grouped into tabs. Use one tab per evidence category (e.g. "Labs", "Medications", "Notes"). */
    evidenceTabs?: EvidenceTab[];
}

// ─── Union of all embeddable component types ──────────────────────────────────

type ComponentProps =
    | RowProps
    | ColumnProps
    | ObservationPanelProps
    | ObservationCardProps
    | LabTrendPanelProps
    | MedicationListProps
    | ConditionListProps
    | ImmunizationListProps
    | EventFeedProps
    | ChartProps
    | FindingCardProps;

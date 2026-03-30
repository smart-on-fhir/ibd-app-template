import { MEDICATION_STATUS_COLORS, TREATMENT_TYPES } from './config';
import { type TimelineEvent } from './utils';

// ─── Status color helper ─────────────────────────────────────────────────────


function statusColor(status?: string, fallback = '#318ebc88'): string {
    if (!status) return fallback;
    return MEDICATION_STATUS_COLORS[status.toLowerCase()] ?? fallback;
}

// ─── Medication label helper ─────────────────────────────────────────────────

function medicationLabel(raw: any): string {
    return (
        raw.medicationCodeableConcept?.text
        || raw.medicationCodeableConcept?.coding?.[0]?.display
        || raw.medicationCodeableConcept?.coding?.[0]?.code
        || raw.medicationReference?.display
        || raw.medication?.concept?.text
        || raw.medication?.concept?.coding?.[0]?.display
        || raw.medication?.reference?.display
        || raw.medication?.display
        || 'Unknown medication'
    );
}

// ─── Lens type ───────────────────────────────────────────────────────────────

export type Lens = {
    /** Stable identifier used for state keys */
    id: string;
    /** Human-readable tab label */
    label: string;
    /** Bootstrap icon class */
    icon: string;
    /** Short description shown as tooltip */
    description: string;
    /**
     * Transforms a filtered list of TimelineEvents into a lens-specific view.
     * Returns a NEW array of events with `yLabel` and `color` set.
     * Non-matching events are excluded.
     */
    apply(events: TimelineEvent[]): TimelineEvent[];
};

// ─── Lens: Resources (default, identity) ──────────────────────────────────

export const resourcesLens: Lens = {
    id         : 'resources',
    label      : 'By resource',
    icon       : 'bi-grid-3x3-gap',
    description: 'Default view. Groups all FHIR resources by their resource type on the Y-axis (Encounter, Condition, Observation, etc.). Use this to get a full overview of everything in the patient record.',
    apply(events) {
        // No override — TimelineChart falls back to resourceType for Y-axis
        return events;
    },
};

// ─── Lens: Medications ─────────────────────────────────────────────────────

const MEDICATION_TYPES = new Set([
    'MedicationRequest',
    'MedicationStatement',
    'MedicationAdministration',
    'MedicationDispense',
]);

export const medicationsLens: Lens = {
    id         : 'medications',
    label      : 'Medications',
    icon       : 'bi-capsule-pill',
    description: 'Shows only medication-related resources (MedicationRequest, MedicationStatement, MedicationAdministration, MedicationDispense). Each row is a unique drug name. Color indicates status: green = active, grey = completed, red = stopped or cancelled.',
    apply(events) {
        return events
            .filter(e => MEDICATION_TYPES.has(e.resourceType))
            .map(e => ({
                ...e,
                yLabel: medicationLabel(e.raw),
                color : statusColor(e.raw.status),
            }));
    },
};

// ─── Lens: Procedures ─────────────────────────────────────────────────────

const PROCEDURE_TYPES = new Set(['Procedure']);

export const proceduresLens: Lens = {
    id         : 'procedures',
    label      : 'Procedures',
    icon       : 'bi-scissors',
    description: 'Shows only Procedure resources. Each row is a unique procedure or surgery name. Color indicates status: green = completed or in-progress, red = revoked or stopped. Bars span the performed period when available.',
    apply(events) {
        return events
            .filter(e => PROCEDURE_TYPES.has(e.resourceType))
            .map(e => {
                const raw = e.raw;
                const label =
                    raw.code?.text
                    || raw.code?.coding?.[0]?.display
                    || raw.code?.coding?.[0]?.code
                    || 'Unknown procedure';
                return {
                    ...e,
                    yLabel: label,
                    color : statusColor(raw.status, '#0d6efd88'), // blue fallback
                };
            });
    },
};

// ─── Lens: Clinical Notes ──────────────────────────────────────────────────

/**
 * Returns true if this resource contains free-text / narrative content.
 * The check is content-driven, not purely resource-type-driven.
 */
export function hasNarrativeContent(raw: any): boolean {
    // DocumentReference is the canonical home for notes and attachments
    if (raw.resourceType === 'DocumentReference') return true;

    // Communication: always carries a text payload
    if (raw.resourceType === 'Communication') return true;

    // Composition: structured clinical document (discharge summaries, etc.)
    if (raw.resourceType === 'Composition') return true;

    // DiagnosticReport: only when it has an actual narrative (not just coded results)
    if (raw.resourceType === 'DiagnosticReport') {
        return !!(raw.conclusion || raw.presentedForm?.length || raw.text?.div);
    }

    // Observation: include only when valueString is a substantial free-text note
    if (raw.resourceType === 'Observation') {
        return typeof raw.valueString === 'string' && raw.valueString.trim().length >= 100;
    }

    // Catch-all: any other resource whose FHIR text narrative is substantial
    // (empty shells look like `<div xmlns="..."/>` — ~30 chars; short coded summaries ~60-499)
    return typeof raw.text?.div === 'string' && raw.text.div.trim().length > 500;
}

function notesYLabel(e: TimelineEvent): string {
    const raw = e.raw;
    // For Observations, use the measurement/concept name as the row header
    if (raw.resourceType === 'Observation') {
        return raw.code?.text
            || raw.code?.coding?.[0]?.display
            || 'Observation note';
    }
    return raw.type?.text
        || raw.type?.coding?.[0]?.display
        || raw.category?.[0]?.text
        || raw.category?.[0]?.coding?.[0]?.display
        || e.resourceType;
}

export const notesLens: Lens = {
    id         : 'notes',
    label      : 'Clinical Notes',
    icon       : 'bi-file-earmark-text',
    description: 'Shows resources that contain free-text or narrative content: ' +
        'DocumentReferences, clinical notes, discharge summaries (Composition),' +
        ' Communications, and Observations with a text value. DiagnosticReports' +
        ' are included only when they carry a written conclusion or attachment.',
    apply(events) {
        return events
            .filter(e => hasNarrativeContent(e.raw))
            .map(e => ({
                ...e,
                yLabel: notesYLabel(e),
                color : '#8e44ad88',
            }));
    },
};

// ─── Lens: Treatment vs Outcome ──────────────────────────────────────────────

const OUTCOME_LENS_TYPES = new Set(['Observation', 'Condition']);

function treatmentLensLabel(e: TimelineEvent): string {
    const raw = e.raw;
    if (MEDICATION_TYPES.has(raw.resourceType)) return medicationLabel(raw);
    if (raw.resourceType === 'Procedure')
        return raw.code?.text || raw.code?.coding?.[0]?.display || raw.code?.coding?.[0]?.code || 'Procedure';
    if (raw.resourceType === 'Immunization')
        return raw.vaccineCode?.text || raw.vaccineCode?.coding?.[0]?.display || 'Immunization';
    return e.display ?? e.resourceType;
}

function outcomeLensLabel(e: TimelineEvent): string {
    const raw = e.raw;
    return raw.code?.text || raw.code?.coding?.[0]?.display || e.display || e.resourceType;
}

export const treatmentOutcomeLens: Lens = {
    id         : 'treatment-outcome',
    label      : 'Treatment vs Outcome',
    icon       : 'bi-activity',
    description: 'Two-panel view: treatments and interventions (medications, procedures, immunizations) above, outcome metrics (lab values, observations) below — aligned on the same time axis to reveal correlations.',
    apply(events) {
        return events
            .filter(e => TREATMENT_TYPES.has(e.resourceType) || OUTCOME_LENS_TYPES.has(e.resourceType))
            .map(e => TREATMENT_TYPES.has(e.resourceType)
                ? { ...e, yLabel: treatmentLensLabel(e), color: statusColor(e.raw.status) }
                : { ...e, yLabel: outcomeLensLabel(e),   color: '#318ebc66' }
            );
    },
};

// ─── All lenses in display order ─────────────────────────────────────────

export const ALL_LENSES: Lens[] = [
    resourcesLens,
    medicationsLens,
    proceduresLens,
    notesLens,
    treatmentOutcomeLens,
];

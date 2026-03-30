type FhirReference = {
  reference?: string
}

type FhirPeriod = {
  start?: string
  end?: string
}

type FhirResource = {
  resourceType: string
  id?: string
  encounter?: FhirReference
  period?: FhirPeriod

  // Common FHIR date fields
  effectiveDateTime?: string
  effectivePeriod?: FhirPeriod
  occurrenceDateTime?: string
  occurrencePeriod?: FhirPeriod
  performedDateTime?: string
  performedPeriod?: FhirPeriod
  onsetDateTime?: string
  onsetPeriod?: FhirPeriod
  date?: string
  issued?: string
  recordedDate?: string

  [key: string]: any
}

export type TimelineEvent = {
  resourceType: string
  resourceId: string
  date: string            // ISO string (start)
  endDate?: string        // ISO string (if Period)
  category?: string       // optional classification
  encounterId?: string
  display?: string        // optional short label
  raw: FhirResource      // original resource
  // Lens-applied overrides (set by view mode lenses, not by normalization)
  yLabel?: string         // Y-axis row label override (e.g. medication name, procedure code)
  color?: string          // per-point color override (e.g. status-based)
}

/**
 * Extracts encounter ID from reference string like:
 * "Encounter/123" or full URL
 */
function extractEncounterId(ref?: FhirReference): string | undefined {
  if (!ref?.reference) return undefined

  const parts = ref.reference.split("/")
  return parts[parts.length - 1]
}

/**
 * Returns first valid date candidate found in priority order.
 */
function resolveDate(
  res: FhirResource
): { start?: string; end?: string } {
  const candidates: Array<
    | { type: "instant"; value?: string }
    | { type: "period"; value?: FhirPeriod }
  > = [
    { type: "instant", value: res.effectiveDateTime },
    { type: "period", value: res.effectivePeriod },

    { type: "instant", value: res.occurrenceDateTime },
    { type: "period", value: res.occurrencePeriod },

    { type: "instant", value: res.performedDateTime },
    { type: "period", value: res.performedPeriod },

    { type: "instant", value: res.onsetDateTime },
    { type: "period", value: res.onsetPeriod },
    { type: "period", value: res.period },

    { type: "instant", value: res.date },
    { type: "instant", value: res.issued },
    { type: "instant", value: res.authoredOn },
    { type: "instant", value: res.recordedDate }
  ]

  for (const c of candidates) {
    if (c.type === "instant" && c.value) {
      return { start: c.value }
    }

    if (c.type === "period" && c.value?.start) {
      return {
        start: c.value.start,
        end: c.value.end
      }
    }
  }

  return {}
}

/**
 * Derives a simple category by resource type
 */
function categorize(resourceType: string): string {
  switch (resourceType) {
    case "Encounter":
      return "encounter"
    case "Condition":
      return "condition"
    case "Observation":
      return "observation"
    case "Procedure":
      return "procedure"
    case "MedicationRequest":
    case "MedicationStatement":
    case "MedicationAdministration":
    case "MedicationDispense":
      return "medication"
    case "Immunization":
      return "immunization"
    case "DiagnosticReport":
      return "report"
    default:
      return "other"
  }
}

export function getIconForResourceType(resourceType: string): string {
  switch (resourceType) {
    case "Encounter":
      return "bi-calendar-event"
    case "Condition":
      return "bi-exclamation-square"
    case "Observation":
      return "bi-flask"
    case "Procedure":
      return "bi-scissors"
    case "MedicationStatement":
    case "MedicationAdministration":
      return "bi-capsule-pill"
    case "Immunization":
      return "bi-shield-plus"
    case "DiagnosticReport":
      return "bi-file-earmark-text"
    default:
      return "bi-record-circle-fill"
  }
}

export function resolveDisplay(resource: FhirResource): string {
  switch (resource.resourceType) {
    case 'Immunization':
      return resource.vaccineCode?.text
        || resource.vaccineCode?.coding?.[0]?.display
        || '';
    case 'Encounter':
      return resource.type?.[0]?.text
        || resource.type?.[0]?.coding?.[0]?.display
        || resource.class?.display
        || resource.class?.code
        || '';
    case 'MedicationRequest':
    case 'MedicationStatement':
    case 'MedicationAdministration':
    case 'MedicationDispense':
      return resource.medicationCodeableConcept?.text
        || resource.medicationCodeableConcept?.coding?.[0]?.display
        || resource.medicationCodeableConcept?.coding?.[0]?.code
        || resource.medicationReference?.display
        || resource.medication?.concept?.text
        || resource.medication?.concept?.coding?.[0]?.display
        || resource.medication?.reference?.display
        || resource.medication?.display
        || '';
    default:
      return resource.code?.text
        || resource.code?.coding?.[0]?.display
        || resource.name
        || resource.title
        || '';
  }
}

/**
 * Main normalization function
 */
export function normalizeToTimelineEvent(
  resource: FhirResource
): TimelineEvent | null {
  if (!resource?.resourceType || !resource?.id) {
    return null
  }

  const { start, end } = resolveDate(resource)

  if (!start) {
    return null
  }

  return {
    resourceType: resource.resourceType,
    resourceId: resource.id,
    date: start,
    endDate: end,
    category: categorize(resource.resourceType),
    encounterId: extractEncounterId(resource.encounter),
    raw: resource,
    display: resolveDisplay(resource)
  }
}

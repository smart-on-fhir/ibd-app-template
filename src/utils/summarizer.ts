import type { Address, Condition, FhirResource, Organization, Patient, Practitioner, RelatedPerson, HumanName } from "fhir/r4";


interface Property {
    name: string;
    value: string;
    type: 'string' | 'date' | 'number' | 'boolean';
    description?: string;
    custom?: any;
}


const INCLUDE_IDS_IN_SUMMARY = false

const NAME_USE_PRIORITY: Record<string, number> = {
    official: 0,
    usual:    1,
    nickname: 2,
    maiden:   3,
    temp:     4,
    old:      5,
    anonymous: 6,
};

export function summarizeHumanName(name: HumanName | HumanName[]): string {
    if (Array.isArray(name)) {
        // Pick the single highest-priority entry; fall back to the first if all render the same
        const sorted = [...name].sort((a, b) =>
            (NAME_USE_PRIORITY[a.use ?? ''] ?? 99) - (NAME_USE_PRIORITY[b.use ?? ''] ?? 99)
        );
        return summarizeHumanName(sorted[0] ?? {});
    }
    const parts = [];
    if (name.prefix) parts.push(name.prefix.join(' '));
    if (name.given) parts.push(name.given.join(' '));
    if (name.family) parts.push(name.family);
    if (name.suffix) parts.push(name.suffix.join(' '));
    return parts.filter(Boolean).join(' ');
}

function summarizeAddress(address: Address): string {
    const parts = [];
    if (address.line) parts.push(address.line.join(', '));
    if (address.city) parts.push(address.city);
    if (address.state) parts.push(address.state);
    if (address.postalCode) parts.push(address.postalCode);
    if (address.country) parts.push(address.country);
    return parts.filter(Boolean).join(', ');
}

function summarizeContactPoint(telecom: { system?: string; value?: string; use?: string; rank?: number }): string {
    return `${telecom.system || 'unknown'}: ${telecom.value || 'N/A'}`;
}

function summarizeDate(dateStr: string): string {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'Invalid date';
    return date.toISOString().substring(0, 10);
}

export function summarizeOrganization(org: Organization): string {
  const lines = [];
  lines.push(`Name: ${org.name || 'N/A'}`);
  if (org.address && org.address.length > 0) {
    const addr = org.address[0];
    const addrLines = summarizeAddress(addr);
    lines.push(`Address: ${addrLines}`);
  }
  if (org.telecom && org.telecom.length > 0) {
    const telecoms = org.telecom.map((t: any) => summarizeContactPoint(t)).join('; ');
    lines.push(`Contact: ${telecoms}`);
  }
  return lines.join('\n');
}

// Person (Patient, Practitioner, RelatedPerson) -------------------------------

export function summarizePerson(resource: Patient | Practitioner | RelatedPerson): Property[] {
    const lines: Property[] = [];
    
    if (INCLUDE_IDS_IN_SUMMARY) {
        lines.push({ name: 'ID', value: resource.id || 'N/A', type: 'string' });
    }
    
    const name = resource.name ? summarizeHumanName(resource.name) : 'N/A';
    lines.push({ name: 'Name', value: name, type: 'string' });

    if (resource.gender) {
        lines.push({ name: 'Gender', value: resource.gender, type: 'string' });
    }
    if (resource.birthDate) {
        lines.push({ name: 'Birth Date', value: summarizeDate(resource.birthDate), type: 'date' });
    }
    if ((resource as any).deceasedDateTime) {
        lines.push({ name: 'Deceased', value: summarizeDate((resource as any).deceasedDateTime), type: 'date' });
    }
    if (resource.birthDate && !(resource as any).deceasedDateTime) {
        const birthDate = new Date(resource.birthDate);
        const now = new Date();
        let age = now.getFullYear() - birthDate.getFullYear();
        const m = now.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) {
            age--;
        }
        lines.push({ name: 'Age', value: `${age} years`, type: 'string' });
    }
    if (resource.address && resource.address.length > 0) {
        const addr = resource.address[0];
        const addrLines = summarizeAddress(addr);
        lines.push({ name: 'Address', value: addrLines, type: 'string' });
    }
    if (resource.telecom && resource.telecom.length > 0) {
        const telecoms = resource.telecom.map((t: any) => summarizeContactPoint(t)).join('; ');
        lines.push({ name: 'Contact', value: telecoms, type: 'string' });
    }

    return lines;
}

export function summarizePersonAsString(resource: Patient | Practitioner | RelatedPerson): string {
    return summarizePerson(resource).map(prop => `${prop.name}: ${prop.value}`).join('\n');
}

function summarizeCondition(condition: Condition): string {
    const lines = [];
    if (INCLUDE_IDS_IN_SUMMARY) {
        lines.push(`ID: ${condition.id || 'N/A'}`);
    }
    if (condition.code && condition.code.text) {
        lines.push(`Code: ${condition.code.text}`);
    }
    if (condition.clinicalStatus) {
        if (condition.clinicalStatus.text) {
            lines.push(`Clinical Status: ${condition.clinicalStatus.text}`);
        } else if ((condition.clinicalStatus.coding || []).length > 0) {
            const coding = condition.clinicalStatus.coding![0];
            lines.push(`Clinical Status: ${coding.display || coding.code || 'N/A'}`);
        }
    }
    if (condition.verificationStatus) {
        if (condition.verificationStatus.text) {
            lines.push(`Verification Status: ${condition.verificationStatus.text}`);
        } else if ((condition.verificationStatus.coding || []).length > 0) {
            const coding = condition.verificationStatus.coding![0];
            lines.push(`Verification Status: ${coding.display || coding.code || 'N/A'}`);
        }
    }
    if (condition.onsetDateTime) {
        lines.push(`Onset: ${summarizeDate(condition.onsetDateTime)}`);
    }
    if (condition.abatementDateTime) {
        lines.push(`Abatement: ${summarizeDate(condition.abatementDateTime)}`);
    }
    if (condition.recordedDate) {
        lines.push(`Recorded: ${summarizeDate(condition.recordedDate)}`);
    }
    return lines.join('\n');
}

// Observation -----------------------------------------------------------------

function summarizeObservation(observation: FhirResource): Property[] {
    const lines: Property[] = [];

    // id
    if (INCLUDE_IDS_IN_SUMMARY) {
        lines.push({ name: 'ID', value: (observation as any).id || 'N/A', type: 'string' });
    }

    // code
    if ((observation as any).code && (observation as any).code.text) {
        lines.push({ name: 'Code', value: (observation as any).code.text, type: 'string' });
    }

    // value
    if ((observation as any).valueQuantity) {
        const vq = (observation as any).valueQuantity;
        lines.push({ name: 'Value', value: `${vq.value} ${vq.unit || ''}`.trim(), type: 'string' });
    } else if ((observation as any).valueString) {
        lines.push({ name: 'Value', value: (observation as any).valueString, type: 'string' });
    } else if ((observation as any).valueCodeableConcept && (observation as any).valueCodeableConcept.text) {
        lines.push({ name: 'Value', value: (observation as any).valueCodeableConcept.text, type: 'string' });
    }

    // effectiveDateTime
    if ((observation as any).effectiveDateTime) {
        lines.push({ name: 'Effective', value: summarizeDate((observation as any).effectiveDateTime), type: 'date' });
    }

    return lines;
}

export function summarizeObservationToString(observation: FhirResource): string {
    return summarizeObservation(observation).map(p => `${p.name}: ${p.value}`).join('\n');
}

// Encounter -------------------------------------------------------------------

export function summarizeEncounter(encounter: FhirResource): Property[] {
    const lines: Property[] = [];
    
    if (INCLUDE_IDS_IN_SUMMARY) {
        lines.push({ name: 'ID', value: (encounter as any).id || 'N/A', type: 'string' });
    }
    if ((encounter as any).status) {
        lines.push({ name: 'Status', value: (encounter as any).status, type: 'string' });
    }
    if ((encounter as any).class) {
        if ((encounter as any).class.display) {
            lines.push({ name: 'Class', value: (encounter as any).class.display, type: 'string' });
        } else if ((encounter as any).class.code) {
            lines.push({ name: 'Class', value: (encounter as any).class.code, type: 'string' });
        }
    }
    if ((encounter as any).type) {
        const types = (encounter as any).type.map((t: any) => t.text || t.coding?.map((c: any) => c.display || c.code).join('/')).join(', ');
        lines.push({ name: 'Type', value: types, type: 'string' });
    }
    if ((encounter as any).reasonCode) {
        const reasons = (encounter as any).reasonCode.map((r: any) => r.text || r.coding?.map((c: any) => c.display || c.code).join('/')).join(', ');
        lines.push({ name: 'Reason', value: reasons, type: 'string' });
    }
    if ((encounter as any).hospitalization) {
        const hosp = (encounter as any).hospitalization;
        if (hosp.admitSource && hosp.admitSource.text) {
            lines.push({ name: 'Admit Source', value: hosp.admitSource.text, type: 'string' });
        }
        if (hosp.dischargeDisposition && hosp.dischargeDisposition.text) {
            lines.push({ name: 'Discharge Disposition', value: hosp.dischargeDisposition.text, type: 'string' });
        }
    }
    if ((encounter as any).period) {
        const period = (encounter as any).period;
        if (period.start) {
            lines.push({ name: 'Start', value: summarizeDate(period.start), type: 'date' });
        }
        if (period.end) {
            lines.push({ name: 'End', value: summarizeDate(period.end), type: 'date' });
        }
    }
    return lines;
}

export function summarizeEncounterToString(encounter: FhirResource): string {
    return summarizeEncounter(encounter).map(p => `${p.name}: ${p.value}`).join('\n');
}

function summarizeClaim(claim: FhirResource): string {
    const lines = [];
    if (INCLUDE_IDS_IN_SUMMARY) {
        lines.push(`ID: ${(claim as any).id || 'N/A'}`);
    }
    if ((claim as any).status) {
        lines.push(`Status: ${(claim as any).status}`);
    }
    if ((claim as any).type) {
        if ((claim as any).type.text) {
            lines.push(`Type: ${(claim as any).type.text}`);
        } else if (((claim as any).type.coding || []).length > 0) {
            const coding = (claim as any).type.coding[0];
            lines.push(`Type: ${coding.display || coding.code || 'N/A'}`);
        }
    }
    if ((claim as any).use) {
        lines.push(`Use: ${(claim as any).use}`);
    }
    // if ((claim as any).patient && (claim as any).patient.display) {
    //     lines.push(`Patient: ${(claim as any).patient.display}`);
    // }
    if ((claim as any).created) {
        lines.push(`Created: ${summarizeDate((claim as any).created)}`);
    }
    if ((claim as any).billablePeriod) {
        const period = (claim as any).billablePeriod;
        if (period.start) {
            lines.push(`Billable Period Start: ${summarizeDate(period.start)}`);
        }
        if (period.end) {
            lines.push(`Billable Period End: ${summarizeDate(period.end)}`);
        }
    }
    if ((claim as any).total) {
        const total = (claim as any).total;
        lines.push(`Total Amount: ${total.value ? Number(total.value).toLocaleString() : 'N/A'} ${total.currency || ''}`.trim());
    }
    return lines.join('\n');
}

function summarizeMedicationRequest(medRequest: FhirResource): string {
    const lines = [];
    if (INCLUDE_IDS_IN_SUMMARY) {
        lines.push(`ID: ${(medRequest as any).id || 'N/A'}`);
    }
    if ((medRequest as any).status) {
        lines.push(`Status: ${(medRequest as any).status}`);
    }
    if ((medRequest as any).intent) {
        lines.push(`Intent: ${(medRequest as any).intent}`);
    }
    if ((medRequest as any).medicationCodeableConcept && (medRequest as any).medicationCodeableConcept.text) {
        lines.push(`Medication: ${(medRequest as any).medicationCodeableConcept.text}`);
    }
    if ((medRequest as any).authoredOn) {
        lines.push(`Authored On: ${summarizeDate((medRequest as any).authoredOn)}`);
    }
    return lines.join('\n');
}

export function summarize(resource: FhirResource, structured?: boolean): string | Property[] {
    switch (resource.resourceType) {
        case 'Organization':
            return summarizeOrganization(resource as Organization);

        case 'Practitioner':
        case 'RelatedPerson':
        case 'Patient':
            return structured ? summarizePerson(resource as Patient | Practitioner | RelatedPerson) : summarizePersonAsString(resource as Patient | Practitioner | RelatedPerson);

        case 'Condition':
            return summarizeCondition(resource as Condition);
        
        case 'Observation':
            return structured ? summarizeObservation(resource) : summarizeObservationToString(resource);

        case 'Encounter':
            return structured ? summarizeEncounter(resource) : summarizeEncounterToString(resource);

        case 'Claim':
        case 'ExplanationOfBenefit':
            return summarizeClaim(resource);

        case 'MedicationRequest':
            return summarizeMedicationRequest(resource);

        default:
            return INCLUDE_IDS_IN_SUMMARY ? `Resource Type: ${resource.resourceType}, ID: ${(resource as any).id || 'N/A'}` : '';
    }
}

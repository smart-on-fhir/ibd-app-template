import type { Condition, FhirResource, Organization, Patient, Practitioner, RelatedPerson } from "fhir/r4";

const INCLUDE_IDS_IN_SUMMARY = false

function summarizeHumanName(name: { use?: string; text?: string; family?: string; given?: string[]; prefix?: string[]; suffix?: string[] }): string {
    const parts = [];
    if (name.prefix) parts.push(name.prefix.join(' '));
    if (name.given) parts.push(name.given.join(' '));
    if (name.family) parts.push(name.family);
    if (name.suffix) parts.push(name.suffix.join(' '));
    return parts.filter(Boolean).join(' ');
}

function summarizeAddress(address: { use?: string; type?: string; text?: string; line?: string[]; city?: string; district?: string; state?: string; postalCode?: string; country?: string }): string {
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

function summarizeOrganization(org: Organization): string {
  const lines = [];
  lines.push(`Organization: ${org.name || 'N/A'}`);
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

function summarizePerson(resource: Patient | Practitioner | RelatedPerson): string {
    const lines = [];
    if (INCLUDE_IDS_IN_SUMMARY) {
        lines.push(`ID: ${resource.id || 'N/A'}`);
    }
    const name = resource.name && resource.name.length > 0
        ? resource.name.map(n => summarizeHumanName(n)).join(', ')
        : 'N/A';
    lines.push(`Name: ${name}`);
    if (resource.gender) {
        lines.push(`Gender: ${resource.gender}`);
    }
    if (resource.birthDate) {
        lines.push(`Birth Date: ${summarizeDate(resource.birthDate)}`);
    }
    return lines.join('\n');
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

function summarizeObservation(observation: FhirResource): string {
    const lines = [];
    if (INCLUDE_IDS_IN_SUMMARY) {
        lines.push(`ID: ${(observation as any).id || 'N/A'}`);
    }
    if ((observation as any).code && (observation as any).code.text) {
        lines.push(`Code: ${(observation as any).code.text}`);
    }
    if ((observation as any).valueQuantity) {
        const vq = (observation as any).valueQuantity;
        lines.push(`Value: ${vq.value} ${vq.unit || ''}`.trim());
    } else if ((observation as any).valueString) {
        lines.push(`Value: ${(observation as any).valueString}`);
    } else if ((observation as any).valueCodeableConcept && (observation as any).valueCodeableConcept.text) {
        lines.push(`Value: ${(observation as any).valueCodeableConcept.text}`);
    }
    if ((observation as any).effectiveDateTime) {
        lines.push(`Effective: ${summarizeDate((observation as any).effectiveDateTime)}`);
    }
    return lines.join('\n');
}

function summarizeEncounter(encounter: FhirResource): string {
    const lines = [];
    if (INCLUDE_IDS_IN_SUMMARY) {
        lines.push(`ID: ${(encounter as any).id || 'N/A'}`);
    }
    if ((encounter as any).status) {
        lines.push(`Status: ${(encounter as any).status}`);
    }
    if ((encounter as any).class) {
        if ((encounter as any).class.display) {
            lines.push(`Class: ${(encounter as any).class.display}`);
        } else if ((encounter as any).class.code) {
            lines.push(`Class: ${(encounter as any).class.code}`);
        }
    }
    if ((encounter as any).type) {
        const types = (encounter as any).type.map((t: any) => t.text || t.coding?.map((c: any) => c.display || c.code).join('/')).join(', ');
        lines.push(`Type: ${types}`);
    }
    if ((encounter as any).reasonCode) {
        const reasons = (encounter as any).reasonCode.map((r: any) => r.text || r.coding?.map((c: any) => c.display || c.code).join('/')).join(', ');
        lines.push(`Reason: ${reasons}`);
    }
    if ((encounter as any).hospitalization) {
        const hosp = (encounter as any).hospitalization;
        if (hosp.admitSource && hosp.admitSource.text) {
            lines.push(`Admit Source: ${hosp.admitSource.text}`);
        }
        if (hosp.dischargeDisposition && hosp.dischargeDisposition.text) {
            lines.push(`Discharge Disposition: ${hosp.dischargeDisposition.text}`);
        }
    }
    if ((encounter as any).period) {
        const period = (encounter as any).period;
        if (period.start) {
            lines.push(`Start: ${summarizeDate(period.start)}`);
        }
        if (period.end) {
            lines.push(`End: ${summarizeDate(period.end)}`);
        }
    }
    return lines.join('\n');
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

export function summarize(resource: FhirResource): string {
    switch (resource.resourceType) {
        case 'Organization':
            return summarizeOrganization(resource as Organization);

        case 'Practitioner':
        case 'RelatedPerson':
        case 'Patient':
            return summarizePerson(resource as Patient | Practitioner | RelatedPerson);

        case 'Condition':
            return summarizeCondition(resource as Condition);
        
        case 'Observation':
            return summarizeObservation(resource);

        case 'Encounter':
            return summarizeEncounter(resource);

        case 'Claim':
            return summarizeClaim(resource);

        case 'MedicationRequest':
            return summarizeMedicationRequest(resource);

        default:
            return INCLUDE_IDS_IN_SUMMARY ? `Resource Type: ${resource.resourceType}, ID: ${(resource as any).id || 'N/A'}` : '';
    }
}
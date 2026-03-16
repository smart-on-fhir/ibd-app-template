import type { FhirResource, Patient, Resource } from "fhir/r4";

export type JSONValue =
	| string
	| number
	| boolean
	| null
	| { [key: string]: JSONValue }
	| JSONValue[];

export interface PatientSummary {
    name?: string;
    dob?: string;
    gender?: string;
    mrn?: string;
    conditions: Array<{ code?: string; clinicalStatus?: string; onset?: string }>;
    medications: Array<{ name?: string; status?: string; authoredOn?: string }>; 
    allergies: string[];
    observations: Record<string, { value?: string; unit?: string; date?: string }>;
    immunizationsCount: number;
    lastEncounter?: { date?: string; type?: string };
    totalResources: number;
}

export interface SelectedPatient {
    patient: Patient;
    summary: PatientSummary;
    resources: Record<string, FhirResource[]>;
}
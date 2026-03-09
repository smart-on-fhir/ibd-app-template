/**
 * LLM CONTRACT — DO NOT USE AT RUNTIME
 * This file documents the API surface available to the LLM planner.
 */

type ISODate = string;

type ConditionClinicalStatus = "active"|"recurrence"|"relapse"|"inactive"|"remission"|"resolved"|string;

type ConditionVerificationStatus = "unconfirmed"|"provisional"|"differential"|"confirmed"|"refuted"|"entered-in-error"|string;

type EncounterStatus = "planned"|"arrived"|"triaged"|"in-progress"|"onleave"|"finished"|"cancelled"|"entered-in-error"|"unknown";

interface ConditionAttributes {
    id: string | null;
    code: string | null;
    codeDisplay: string | null;
    codeText: string | null;
    codeSystem: string | null;
    clinicalStatus: ConditionClinicalStatus | null;
    verificationStatus: ConditionVerificationStatus | null;
    onsetDateTime: Date | null;
    abatementDateTime: Date | null;
    recordedDate: Date | null;
}

interface ClaimAttributes {
    id: string | null;
    status: string | null;
    type: string | null;
    use: string | null;
    created: ISODate | null;
    billablePeriodStart: ISODate | null;
    billablePeriodEnd: ISODate | null;
}

interface EncounterAttributes {
    id: string | null;
    status: EncounterStatus | null;
    class: string | null;
    type: string | null;
    reasonCode: string | null;
    admitSource: string | null;
    dischargeDisposition: string | null;
    periodStart: Date | null;
    periodEnd: Date | null;
}

interface MedicationRequestAttributes {
    id: string | null;
    status: string | null;
    intent: string | null;
    medication: string | null;
    authoredOn: ISODate | null;
}

interface ObservationAttributes {
    id: string | null;
    code: string | null;
    codeDisplay: string | null;
    codeText: string | null;
    codeSystem: string | null;
    value: string | null;
    effectiveDateTime: Date | null;
    components : string | null;
    encounter  : string | null;
}

interface OrganizationAttributes {
    id: string | null;
    address: string | null;
    contact: string | null;
}

interface PatientAttributes {
    id: string | null;
    name: string | null;
    birthDate: ISODate | null;
    gender: string | null;
}

interface PractitionerAttributes {
    id: string | null;
    name: string | null;
    birthDate: ISODate | null;
    gender: string | null;
}

interface RelatedPersonAttributes {
    id: string | null;
    name: string | null;
    birthDate: ISODate | null;
    gender: string | null;
}

interface Database {
    Claim: ClaimAttributes[];
    Condition: ConditionAttributes[];
    Encounter: EncounterAttributes[];
    MedicationRequest: MedicationRequestAttributes[];
    Observation: ObservationAttributes[];
    Organization: OrganizationAttributes[];
    Practitioner: PractitionerAttributes[];
    Patient: PatientAttributes[];
    RelatedPerson: RelatedPersonAttributes[];
}

interface ConditionsAPI {
    
    // conditions --------------------------------------------------------------
    
    /** Get a condition by its ID */
    getConditionById(id: string): ConditionAttributes | null;
    /** Get conditions by one or more clinical status codings */
    getConditionsByClinicalStatus(codings: { system?: string, code: string }[]): ConditionAttributes[];
    /** Get conditions by one or more verification status codes */
    getConditionsByVerificationStatus(codes: ConditionVerificationStatus[]): ConditionAttributes[];
    /** Get conditions with onset date/time within the specified range */
    getConditionsByOnsetDateTime(start: Date, end: Date): ConditionAttributes[];
    /** Get conditions with abatement date/time within the specified range */
    getConditionsByAbatementDateTime(start: Date, end: Date): ConditionAttributes[];
    /** Get conditions with recorded date within the specified range */
    getConditionsByRecordedDate(start: Date, end: Date): ConditionAttributes[];

    // observations ------------------------------------------------------------
    
    /** Get an observation by its ID */
    getObservationById(id: string): ObservationAttributes | null;
    /** Get observations by one or more code codings */
    getObservationsByCode(codes: { system?: string, code: string }[]): ObservationAttributes[];
    /** Get observations with effective date/time within the specified range */
    getObservationsByEffectiveDateTime(start: Date, end: Date): ObservationAttributes[];
    /** Get observations with the specified value */
    getObservationsByValue(value: string): ObservationAttributes[];
    /** Get observations associated with a specific encounter */
    getObservationsByEncounter(encounterId: string): ObservationAttributes[];

    // encounters --------------------------------------------------------------

    /** Get an encounter by its ID */
    getEncounterById(id: string): EncounterAttributes | null;
    /** Get an encounter by its status */
    getEncounterByStatus(status: EncounterStatus): EncounterAttributes | null;
}
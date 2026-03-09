import type { ConditionAttributes, ClinicalAPI, Database, ObservationAttributes, EncounterAttributes, EncounterStatus, } from "./types";

export function getClinicalAPI(DB: Database): ClinicalAPI {
    return {

        // ---------------------------------------------------------------------
        // Condition
        // ---------------------------------------------------------------------

        getConditionById: (id: string): ConditionAttributes | null => {
            return DB.Condition.find(c => c.id === id) || null;
        },

        getConditionsByClinicalStatus: (codings: { system?: string, code: string }[]): ConditionAttributes[] => {
            return DB.Condition.filter(condition => {
                if (!condition.clinicalStatus) return false;
                return codings.some(coding => {
                    if (coding.system && coding.system !== condition.codeSystem) {
                        return false
                    }
                    return coding.code === condition.clinicalStatus
                });
            });
        },

        getConditionsByVerificationStatus: (codes: string[]): ConditionAttributes[] => {
            return DB.Condition.filter(condition => {
                if (!condition.verificationStatus) return false;
                return codes.includes(condition.verificationStatus);
            });
        },

        getConditionsByOnsetDateTime: (start: string, end: string): ConditionAttributes[] => {
            return DB.Condition.filter(condition => {
                if (!condition.onsetDateTime) return false;
                return condition.onsetDateTime >= start && condition.onsetDateTime <= end;
            });
        },

        getConditionsByAbatementDateTime: (start: string, end: string): ConditionAttributes[] => {
            return DB.Condition.filter(condition => {
                if (!condition.abatementDateTime) return false;
                return condition.abatementDateTime >= start && condition.abatementDateTime <= end;
            });
        },

        getConditionsByRecordedDate: (start: string, end: string): ConditionAttributes[] => {
            return DB.Condition.filter(condition => {
                if (!condition.recordedDate) return false;
                return condition.recordedDate >= start && condition.recordedDate <= end;
            });
        },

        // ---------------------------------------------------------------------
        // Observation
        // ---------------------------------------------------------------------

        getObservationById: (id: string): ObservationAttributes | null => {
            return DB.Observation.find(obs => obs.id === id) || null;
        },

        getObservationsByCode: (codes: { system?: string, code: string }[]): ObservationAttributes[] => {
            return DB.Observation.filter(obs => {
                if (!obs.code) return false;
                return codes.some(coding => {
                    if (coding.system && coding.system !== obs.codeSystem) {
                        return false;
                    }
                    return coding.code === obs.code;
                });
            });
        },

        getObservationsByEffectiveDateTime: (start: string, end: string): ObservationAttributes[] => {
            return DB.Observation.filter(obs => {
                if (!obs.effectiveDateTime) return false;
                return obs.effectiveDateTime >= start && obs.effectiveDateTime <= end;
            });
        },

        getObservationsByValue: (value: string): ObservationAttributes[] => {
            return DB.Observation.filter(obs => {
                if (!obs.value) return false;
                return obs.value === value;
            });
        },

        getObservationsByEncounter: (encounterId: string): ObservationAttributes[] => {
            return DB.Observation.filter(obs => {
                if (!obs.encounter) return false;
                return obs.encounter === encounterId;
            });
        },

        // ---------------------------------------------------------------------
        // Encounter
        // ---------------------------------------------------------------------

        getEncounterById: (id: string): EncounterAttributes | null => {
            return DB.Encounter.find(e => e.id === id) || null;
        },

        getEncounterByStatus: (status: EncounterStatus): EncounterAttributes | null => {
            return DB.Encounter.find(e => e.status === status) || null;
        },
    };
}
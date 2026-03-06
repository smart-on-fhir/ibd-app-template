import type { Observation }           from "fhir/r4";
import { Model }                      from "./Model";
import type { ObservationAttributes } from "./types";


export class ObservationModel extends Model<ObservationAttributes> {

    static readonly schema = {
        attributes: {
            id: {
                dataType: 'string' as const,
                label: "ID",
                description: "The unique identifier for the observation"
            },
            code: {
                dataType: "string" as const,
                label: "Code",
                description: "The code of the observation",
                summary: true
            },
            codeDisplay: {
                dataType: "string" as const,
                label: "Code Display",
                description: "The display text of the code of the observation"
            },
            codeText: {
                dataType: "string" as const,
                label: "Code Text",
                description: "The text representation of the code of the observation",
                summary: true
            },
            codeSystem: {
                dataType: "string" as const,
                label: "Code System",
                description: "The system of the code of the observation"
            },
            value: {
                dataType: "string" as const,
                label: "Value",
                description: "The value of the observation",
                summary: true
            },
            components: {
                dataType: "string" as const,
                label: "Components",
                description: "Joined component values for panel observations",
            },
            effectiveDateTime: {
                dataType: "date" as const,
                label: "Effective Date Time",
                description: "The date and time when the observation was made",
                summary: true,
                renderer: (d: Date) => {
                    return d ? d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
                }
            },
            encounter: {
                dataType: "string" as const,
                label: "Encounter ID",
                description: "The encounter associated with the observation",
                summary: true
            }
        }
    };

    readonly attributes: ObservationAttributes = {
        id               : null,
        code             : null,
        codeDisplay      : null,
        codeSystem       : null,
        codeText         : null,
        value            : null,
        effectiveDateTime: null,
        components       : null,
        encounter        : null
    };
    
    constructor(observation: Observation) {
        super();

        const {
            id,
            code,
            effectiveDateTime,
            valueQuantity,
            valueString,
            valueCodeableConcept,
            valueBoolean,
            valueDateTime,
            valuePeriod,
            valueRange,
            valueRatio,
            valueTime
        } = observation;

        // id ------------------------------------------------------------------
        this.setAttribute("id", id || null);
        
        // code, codeDisplay, codeSystem, codeText -----------------------------
        if (code?.coding && code.coding.length > 0) {
            const coding = code.coding[0];
            this.setAttribute("code"       , coding.code    || null);
            this.setAttribute("codeDisplay", coding.display || null);
            this.setAttribute("codeSystem" , coding.system  || null);
            this.setAttribute("codeText"   , coding.display || null);
        }

        if (code?.text) {
            this.setAttribute("codeText", code.text || null);
        }

        // effectiveDateTime ---------------------------------------------------
        this.setAttribute("effectiveDateTime", effectiveDateTime || null);

        // encounter -----------------------------------------------------------
        if (observation.encounter && observation.encounter.reference) {
            const ref = observation.encounter.reference;
            const parts = ref.split("/");
            if (parts.length === 2 && parts[0] === "Encounter") {
                this.setAttribute("encounter", parts[1]);
            } else {
                this.setAttribute("encounter", ref);
            }
        }
        
        // value ---------------------------------------------------------------
        if (valueQuantity) {
            this.setAttribute("value", `${isNaN(+String(valueQuantity.value)) ? valueQuantity.value : Number(valueQuantity.value).toFixed(2)} ${valueQuantity.unit || ''}`.trim());
        } else if (valueString) {
            this.setAttribute("value", valueString.trim() || null);
        } else if (valueCodeableConcept) {
            this.setAttribute("value", valueCodeableConcept.text || null);
        } else if (valueBoolean !== undefined) {
            this.setAttribute("value", valueBoolean.toString());
        } else if (valueDateTime) {
            this.setAttribute("value", valueDateTime);
        } else if (valuePeriod) {
            const period = valuePeriod;
            const start = period.start ? period.start : '';
            const end = period.end ? period.end : '';
            this.setAttribute("value", start && end ? `${start} - ${end}` : start || end || null);
        } else if (valueRange) {
            const range = valueRange;
            const low = range.low ? `${range.low.value} ${range.low.unit || ''}`.trim() : '';
            const high = range.high ? `${range.high.value} ${range.high.unit || ''}`.trim() : '';
            this.setAttribute("value", low && high ? `${low} - ${high}` : low || high || null);
        } else if (valueRatio) {
            const ratio = valueRatio;
            const numerator = ratio.numerator ? `${ratio.numerator.value} ${ratio.numerator.unit || ''}`.trim() : '';
            const denominator = ratio.denominator ? `${ratio.denominator.value} ${ratio.denominator.unit || ''}`.trim() : '';
            this.setAttribute("value", numerator && denominator ? `${numerator} / ${denominator}` : numerator || denominator || null);
        } else if (valueTime) {
            this.setAttribute("value", valueTime);
        } else {
            this.setAttribute("value", null);
        }        
        // Special handling: blood pressure observations often use `component`
        // with systolic/diastolic in sub-observations. If present, prefer
        // rendering as "SYS/DIA unit".
        if (!this.attributes.value && (observation as any).component && Array.isArray((observation as any).component)) {
            const comps = (observation as any).component as any[];
            // Known LOINC codes for systolic/diastolic
            const SYSTOLIC = new Set(['8480-6', '271649006']);
            const DIASTOLIC = new Set(['8462-4', '271650006']);

            let systolic: any = null;
            let diastolic: any = null;

            for (const c of comps) {
                const code = c.code;
                const coding = code?.coding || [];
                const codes = coding.map((cd: any) => cd.code).filter(Boolean);
                const text = code?.text || '';

                if (codes.some((cc: string) => SYSTOLIC.has(cc)) || /systolic/i.test(text)) {
                    systolic = c.valueQuantity || c.valueQuantity || c.value || null;
                    continue;
                }
                if (codes.some((cc: string) => DIASTOLIC.has(cc)) || /diastolic/i.test(text)) {
                    diastolic = c.valueQuantity || c.valueQuantity || c.value || null;
                    continue;
                }
            }

            if (systolic && diastolic) {
                const sVal = Number((systolic.value !== undefined) ? String(systolic.value) : String(systolic)).toFixed(0);
                const dVal = Number((diastolic.value !== undefined) ? String(diastolic.value) : String(diastolic)).toFixed(0);
                const unit = systolic.unit || diastolic.unit || '';
                const combined = `${sVal}/${dVal}${unit ? ' ' + unit : ''}`;
                this.setAttribute('value', combined);
            }
                
            else if (comps.length > 0) {
                // Fallback: join component displays
                const parts = comps.map((c) => {
                    const codeText = c.code?.text || (c.code?.coding && c.code.coding[0]?.display) || '';
                    let v = null;
                    if (c.valueQuantity) v = `${isNaN(+c.valueQuantity.value) ? c.valueQuantity.value : Number(c.valueQuantity.value).toFixed(2)}${c.valueQuantity.unit ? ' ' + c.valueQuantity.unit : ''}`;
                    else if (c.valueString) v = c.valueString;
                    else if (c.valueCodeableConcept) v = c.valueCodeableConcept.text || (c.valueCodeableConcept.coding && c.valueCodeableConcept.coding[0]?.display) || '';
                    else v = JSON.stringify(c.value || null);
                    return codeText ? `${codeText}: ${v}` : v;
                }).filter(Boolean);
                if (parts.length) {
                    const joined = parts.join(' | ');
                    this.setAttribute('components', joined);
                    this.setAttribute('value', joined);
                }
            }
        }
    }
}

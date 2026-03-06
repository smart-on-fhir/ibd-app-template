import type { Condition }           from "fhir/r4";
import { Model, type ModelSchema }                    from "./Model";
import type {
    ConditionAttributes,
    ConditionClinicalStatus,
    ConditionVerificationStatus
} from "./types";



export class ConditionModel extends Model<ConditionAttributes> {

    static readonly schema: ModelSchema<ConditionAttributes> = {
        attributes: {
            id: {
                dataType: "string",
                label: "ID",
                description: "The unique identifier for the condition"
            },
            code: {
                dataType: "number",
                label: "Code",
                description: "The code of the condition",
                summary: true
            },
            codeDisplay: {
                dataType: "string",
                label: "Code Display",
                description: "The display text of the code of the condition"
            },
            codeText: {
                dataType: "string",
                label: "Code Text",
                description: "The text representation of the code of the condition",
                summary: true
            },
            codeSystem: {
                dataType: "string",
                label: "Code System",
                description: "The system of the code of the condition"
            },
            clinicalStatus: {
                dataType: "string",
                label: "Clinical Status",
                description: "The clinical status of the condition",
                summary: true
            },
            verificationStatus: {
                dataType: "string",
                label: "Verification Status",
                description: "The verification status of the condition"
            },
            onsetDateTime: {
                dataType: "date",
                label: "Onset Date Time",
                description: "The date and time when the condition began",
                summary: true,
                renderer: (d: Date) => {
                    return d ? d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
                }
            },
            abatementDateTime: {
                dataType: "date",
                label: "Abatement Date Time",
                description: "The date and time when the condition abated"
            },
            recordedDate: {
                dataType: "date",
                label: "Recorded Date",
                description: "The date and time when the condition was recorded",
                summary: true,
                renderer: (d: Date) => {
                    return d ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }) : '';
                },
            },
        }
    };

    readonly attributes: ConditionAttributes = {
        id                : null,
        code              : null,
        codeDisplay       : null,
        codeText          : null,
        codeSystem        : null,
        clinicalStatus    : null,
        verificationStatus: null,
        onsetDateTime     : null,
        abatementDateTime : null,
        recordedDate      : null
    };
    
    constructor(condition: Condition) {
        super();

        const {
            id,
            code,
            clinicalStatus,
            verificationStatus,
            onsetDateTime,
            abatementDateTime,
            recordedDate
        } = condition;

        // id ------------------------------------------------------------------
        this.setAttribute("id", id || null);

        // code, codeDisplay, codeSystem, codeText -----------------------------
        if (code?.coding && code.coding.length > 0) {
            const coding = code.coding[0];
            this.setAttribute("code", coding.code || null);
            this.setAttribute("codeDisplay", coding.display || null);
            this.setAttribute("codeSystem", coding.system || null);
            this.setAttribute("codeText", coding.display || null);
        }

        if (code?.text) {
            this.setAttribute("codeText", code.text);
        }
        
        // clinicalStatus ------------------------------------------------------
        this.setAttribute("clinicalStatus", 
            clinicalStatus?.coding?.[0]?.code as ConditionClinicalStatus ||
            clinicalStatus?.text as ConditionClinicalStatus || null);


        // verificationStatus --------------------------------------------------
        this.setAttribute("verificationStatus",
            verificationStatus?.coding?.[0]?.code as ConditionVerificationStatus ||
            verificationStatus?.text as ConditionVerificationStatus || null);

        // onsetDateTime -------------------------------------------------------
        this.setAttribute("onsetDateTime", onsetDateTime || null);

        // abatementDateTime ---------------------------------------------------
        this.setAttribute("abatementDateTime", abatementDateTime || null);
        
        // recordedDate --------------------------------------------------------
        this.setAttribute("recordedDate", recordedDate || null);
    }
}

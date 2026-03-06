import type { Immunization } from "fhir/r4";
import { Model } from "./Model";
import type { ImmunizationAttributes } from "./types";


export default class ImmunizationModel extends Model<ImmunizationAttributes> {

    static readonly schema = {
        attributes: {
            id: {
                dataType: 'string' as const,
                label: "ID",
                description: "The unique identifier for the immunization"
            },
            vaccineCode: {
                dataType: "string" as const,
                label: "Vaccine Code",
                description: "The code of the vaccine administered",
                summary: true
            },
            occurrenceDateTime: {
                dataType: "date" as const,
                label: "Occurrence Date Time",
                description: "The date and time when the immunization was administered",
                summary: true,
                renderer: (d: Date) => {
                    return d ? d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
                }
            },
            status: {
                dataType: "string" as const,
                label: "Status",
                description: "The status of the immunization",
                summary: true
            }
        }
    };

    readonly attributes: ImmunizationAttributes = {
        id                : null,
        vaccineCode       : null,
        occurrenceDateTime: null,
        status            : null,
    };

    constructor(attributes: Immunization) {
        super();

        const { id, vaccineCode, occurrenceDateTime, status } = attributes;
        
        this.setAttribute("id", id || null);
        this.setAttribute("vaccineCode", vaccineCode.text || null);
        this.setAttribute("occurrenceDateTime", occurrenceDateTime || null);
        this.setAttribute("status", status || null);
    }
    
}
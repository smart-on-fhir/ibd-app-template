import type { Encounter }           from "fhir/r4";
import { Model, type ModelSchema }                    from "./Model";
import type { EncounterAttributes } from "./types";


export class EncounterModel extends Model<EncounterAttributes> {

    static readonly schema: ModelSchema<EncounterAttributes> = {
        attributes: {
            id: {
                dataType: "string",
                label: "ID",
                description: "The unique identifier for the encounter"
            },
            status: {
                dataType: "string",
                label: "Status",
                description: "The status of the encounter",
                summary: true
            },
            class: {
                dataType: "string",
                label: "Class",
                description: "The class of the encounter",
                summary: true
            },
            type: {
                dataType: "string",
                label: "Type",
                description: "The type of the encounter",
                summary: true
            },
            reasonCode: {
                dataType: "string",
                label: "Reason Code",
                description: "The reason code for the encounter",
                summary: true
            },
            admitSource: {
                dataType: "string",
                label: "Admit Source",
                description: "The source of admission for the encounter",
            },
            dischargeDisposition: {
                dataType: "string",
                label: "Discharge Disposition",
                description: "The discharge disposition for the encounter",
            },
            periodStart: {
                dataType: "date",
                label: "Period Start",
                description: "The start date of the encounter period",
                summary: true,
                renderer: (d: Date) => {
                    return d ? d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
                }
            },
            periodEnd: {
                dataType: "date",
                label: "Period End",
                description: "The end date of the encounter period",
                summary: true,
                renderer: (d: Date) => {
                    return d ? d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
                }
            },
        }
    };

    readonly attributes: EncounterAttributes = {
        id                  : null,
        status              : null,
        class               : null,
        type                : null,
        reasonCode          : null,
        admitSource         : null,
        dischargeDisposition: null,
        periodStart         : null,
        periodEnd           : null,
    };
    
    constructor(encounter: Encounter) {
        super();

        this.attributes.id = encounter.id || null;

        this.attributes.status = encounter.status || null;

        this.attributes.class = encounter.class?.display || encounter.class?.code || null;

        this.attributes.type = encounter.type?.map((t: any) => t.text || t.coding?.map((c: any) => c.display || c.code).join('/')).join(', ') || null;
        
        this.attributes.reasonCode = encounter.reasonCode?.map((r: any) => r.text || r.coding?.map((c: any) => c.display || c.code).join('/')).join(', ') || null;
        
        this.attributes.admitSource = encounter.hospitalization?.admitSource?.text || null;
        
        this.attributes.dischargeDisposition = encounter.hospitalization?.dischargeDisposition?.text || null;


        this.setAttribute('periodStart', encounter.period?.start ? new Date(encounter.period?.start) : null);
        this.setAttribute('periodEnd', encounter.period?.end ? new Date(encounter.period?.end) : null);
    }
}


import type { MedicationRequest }           from "fhir/r4";
import { Model }                            from "./Model";
import type { MedicationRequestAttributes } from "./types";


export class MedicationRequestModel extends Model<MedicationRequestAttributes> {

    readonly attributes: MedicationRequestAttributes = {
        id        : null,
        status    : null,
        intent    : null,
        medication: null,
        authoredOn: null,
    };
    
    constructor(medicationRequest: MedicationRequest) {
        super();
        this.attributes.id         = medicationRequest.id || null;
        this.attributes.status     = medicationRequest.status || null;
        this.attributes.intent     = medicationRequest.intent || null;
        this.attributes.medication = medicationRequest.medicationCodeableConcept?.text
            || medicationRequest.medicationCodeableConcept?.coding?.[0]?.display
            || medicationRequest.medicationCodeableConcept?.coding?.[0]?.code
            || medicationRequest.medicationReference?.display
            || null;
        this.attributes.authoredOn = medicationRequest.authoredOn || null;
    }
}

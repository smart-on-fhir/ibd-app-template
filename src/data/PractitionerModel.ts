import type { Practitioner } from "fhir/r4";
import { Model } from "./Model";
import { summarizeHumanName } from "../utils";
import type { PractitionerAttributes } from "./types";


export class PractitionerModel extends Model<PractitionerAttributes> {

    readonly attributes: PractitionerAttributes = {
        id       : null,
        name     : null,
        birthDate: null,
        gender   : null,
    };
    
    constructor(practitioner: Practitioner) {
        super();
        this.attributes.id = practitioner.id || null;

        this.attributes.name = practitioner.name && practitioner.name.length > 0
            ? practitioner.name.map(n => summarizeHumanName(n)).join(', ')
            : null;

        this.attributes.gender = practitioner.gender || null;
        this.attributes.birthDate = practitioner.birthDate || null;
    }
}

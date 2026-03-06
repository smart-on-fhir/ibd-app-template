import type { Patient }           from "fhir/r4";
import { Model }                  from "./Model";
import { summarizeHumanName }     from "../utils";
import type { PatientAttributes } from "./types";


export class PatientModel extends Model<PatientAttributes> {

    readonly attributes: PatientAttributes = {
        id       : null,
        name     : null,
        birthDate: null,
        gender   : null,
    };
    
    constructor(patient: Patient) {
        super();
        this.attributes.id = patient.id || null;

        this.attributes.name = patient.name && patient.name.length > 0
            ? patient.name.map(n => summarizeHumanName(n)).join(', ')
            : null;

        this.attributes.gender = patient.gender || null;
        this.attributes.birthDate = patient.birthDate || null;
    }
}

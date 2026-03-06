import type { RelatedPerson } from "fhir/r4";
import { Model } from "./Model";
import { summarizeHumanName } from "../utils";
import type { RelatedPersonAttributes } from "./types";


export class RelatedPersonModel extends Model<RelatedPersonAttributes> {

    readonly attributes: RelatedPersonAttributes = {
        id       : null,
        name     : null,
        birthDate: null,
        gender   : null,
    };
    
    constructor(relatedPerson: RelatedPerson) {
        super();
        this.attributes.id = relatedPerson.id || null;

        this.attributes.name = relatedPerson.name && relatedPerson.name.length > 0
            ? relatedPerson.name.map(n => summarizeHumanName(n)).join(', ')
            : null;

        this.attributes.gender = relatedPerson.gender || null;
        this.attributes.birthDate = relatedPerson.birthDate || null;
    }
}

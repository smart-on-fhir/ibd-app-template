import type { FhirResource }      from "fhir/r4";
import { OrganizationModel }      from "./OrganizationModel";
import { PatientModel }           from "./PatientModel";
import { EncounterModel }         from "./EncounterModel";
import { PractitionerModel }      from "./PractitionerModel";
import { RelatedPersonModel }     from "./RelatedPersonModel";
import { ConditionModel }         from "./ConditionModel";
import { ObservationModel }       from "./ObservationModel";
import { ClaimModel }             from "./ClaimModel";
import { MedicationRequestModel } from "./MedicationRequestModel";
import { Model }                  from "./Model";
import ImmunizationModel          from "./ImmunizationModel";


export const ModelMap: Record<string, any> = {
    'Organization'     : OrganizationModel,
    'Patient'          : PatientModel,
    'Practitioner'     : PractitionerModel,
    'RelatedPerson'    : RelatedPersonModel,
    'Condition'        : ConditionModel,
    'Observation'      : ObservationModel,
    'Encounter'        : EncounterModel,
    'Claim'            : ClaimModel,
    'MedicationRequest': MedicationRequestModel,
    'Immunization'     : ImmunizationModel,
};

export function modelFactory(resource: FhirResource) {
    const ModelClass = ModelMap[resource.resourceType];
    if (ModelClass) {
        return new ModelClass(resource);
    }
    return new Model(resource);
}

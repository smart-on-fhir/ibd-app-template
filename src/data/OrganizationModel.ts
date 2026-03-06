import type { Organization } from "fhir/r4";
import { Model }             from "./Model";
import { summarizeAddress, summarizeContactPoint }  from "../utils";
import type { OrganizationAttributes } from "./types";


export class OrganizationModel extends Model<OrganizationAttributes> {

    readonly attributes: OrganizationAttributes = {
        id     : null,
        address: null,
        contact: null,
    };
    
    constructor(org: Organization) {
        super();

        this.attributes.id = org.id || null;

        if (org.address && org.address.length > 0) {
            this.attributes.address = summarizeAddress(org.address[0]);
        }

        if (org.telecom && org.telecom.length > 0) {
            this.attributes.contact = org.telecom.map((t: any) => summarizeContactPoint(t)).join('; ');
        }
    }
}

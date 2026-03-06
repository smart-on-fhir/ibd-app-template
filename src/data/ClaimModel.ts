import type { Claim }           from "fhir/r4";
import { Model }                from "./Model";
import type { ClaimAttributes } from "./types";


export class ClaimModel extends Model<ClaimAttributes> {

    readonly attributes: ClaimAttributes = {
        id                 : null,
        status             : null,
        type               : null,
        use                : null,
        created            : null,
        billablePeriodStart: null,
        billablePeriodEnd  : null
    };
    
    constructor(claim: Claim) {
        super();

        this.attributes.id = claim.id || null;

        this.attributes.status = claim.status || null;
        
        if (claim.type) {
            if (claim.type.text) {
                this.attributes.type = claim.type.text;
            } else if (((claim as any).type.coding || []).length > 0) {
                const coding = (claim as any).type.coding[0];
                this.attributes.type = coding.display || coding.code || null;
            }
        }

        this.attributes.use = claim.use || null;

        this.attributes.created = claim.created || null;

        if (claim.billablePeriod) {
            const period = claim.billablePeriod;
            this.attributes.billablePeriodStart = period.start || null;
            this.attributes.billablePeriodEnd = period.end || null;
        }
    }
}

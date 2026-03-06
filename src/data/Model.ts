import type { FhirResource } from "fhir/r4";

export interface AttributeDescriptor {
    dataType    : "string" | "date" | "number" | "boolean";
    label       : string;
    description?: string;
    required?   : boolean;
    nullable?   : boolean;
    summary?    : boolean;
    renderer?   : (value: any) => React.ReactNode;
}

export interface ModelSchema<T> {
    attributes: Record<keyof T, AttributeDescriptor>;
}

export class Model<T extends {} = {}> {

    static schema: ModelSchema<any>;
    
    attributes: T = {} as T;

    // schema: ModelSchema<T> = { attributes: {} as Record<keyof T, AttributeDescriptor> };
    constructor(data: FhirResource = {} as FhirResource) {
        for (const key in data) {
            if (key === "resourceType") continue;
            if (key === "meta") continue;
            if (key === "id") continue;
            if (key === "text") continue;
            if (key === "contained") continue;
            if (key === "identifier") continue;
            
            let value = data[key as keyof FhirResource] as any;



            if (value && typeof value === "object") {
                value = Array.isArray(value) ? value[0] : value;
                
                const val = (
                    value.text ||
                    value.display ||
                    value.id ||
                    value.reference ||
                    (value.start && value.end ? `${value.start} - ${value.end}` : null) ||
                    value.coding?.[0]?.display ||
                    value.coding?.[0]?.code ||
                    value.coding?.[0]?.reference
                    // || JSON.stringify(value)
                ) as any;

                if (val !== null && val !== undefined) {
                    this.attributes[key as keyof T] = val as any;
                }
            }
            else {
                this.attributes[key as keyof T] = value as any;
            }
        }
    }

    setAttribute(key: keyof T, value: any) {

        const schema = (this.constructor as typeof Model).schema;

        if (!(key in schema.attributes)) {
            throw new Error(`Invalid attribute key: ${String(key)}`);
        }
        const descriptor = schema.attributes[key];
        if (descriptor.required && (value === null || value === undefined)) {
            throw new Error(`Attribute ${String(key)} is required`);
        }
        if (descriptor.nullable === false && value === null) {
            throw new Error(`Attribute ${String(key)} cannot be null`);
        }
        if (descriptor.dataType === "number") {
            const n = parseFloat(value + "");
            this.attributes[key as unknown as keyof T] = isNaN(n) ? null : n as any;
        }
        else if (descriptor.dataType === "date") {
            const d = new Date(value);
            this.attributes[key as unknown as keyof T] = isNaN(d.getTime()) ? null : d as any;
        }
        else {
            this.attributes[key as unknown as keyof T] = value;
        }
    }

    toJSON(): Record<string, any> {
        return this.attributes
    }

    toDelimitedString(delimiter = ", "): string {
        return Object.keys(this.attributes)
            .map(attr => this.attributes[attr as keyof T] ?? "")
            .join(delimiter)
            .replace(/\s+/g, ' ')
            .trim();
    }

    toString(): string {
        return Object.keys(this.attributes)
            .map(attr => `${attr}: ${this.attributes[attr as keyof T] ?? ""}`)
            .join(", ");
    }
}

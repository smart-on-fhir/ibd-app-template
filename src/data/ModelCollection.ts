import type { Model } from "./Model";

export class ModelCollection<T extends Model> {
    private items: T[] = [];

    constructor(items?: T[]) {
        if (items) {
            this.items = items;
        }
    }
    
    add(item: T) {
        this.items.push(item);
    }

    getItems(): T[] {
        return this.items;
    }

    size(): number {
        return this.items.length;
    }

    toJSON(): Record<string, any>[] {
        return this.items.map(item => item.toJSON());
    }

    toString(): string {
        return this.items.map(item => item.toString()).join("\n");
    }

    toCSV(delimiter = ","): string {
        if (this.items.length === 0) return "";
        const headers = Object.keys(this.items[0].attributes);
        const csvRows = this.items.map(item => 
            headers.map(header => {
                const value = item.attributes[header as keyof typeof item.attributes] as unknown;
                if (typeof value === 'string' && (value.includes(delimiter) || value.includes('"') || value.includes('\n'))) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value;
            }).join(delimiter)
        );
        return [headers.join(delimiter), ...csvRows].join("\n");
    }
}
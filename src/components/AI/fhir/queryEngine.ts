import { evaluate } from 'fhirpath';
import type { FhirResource } from 'fhir/r4';
import type { FhirQuery, QueryResult } from './types';
import { resolveRelativeDates, unwrap } from './fhirpathUtils';
import type { ResourcesByType } from './tools';

const HARD_LIMIT = 200;
const SYNC_OPTS = { async: false } as const;

function fp(resource: unknown, expr: string): unknown[] {
    return evaluate(resource, expr, undefined, undefined, SYNC_OPTS);
}

export function executeQuery(query: FhirQuery, store: ResourcesByType): QueryResult {
    const resources: FhirResource[] = store[query.from] ?? [];

    // Filter
    const whereExpr = query.where ? resolveRelativeDates(query.where) : null;
    const filtered = whereExpr
        ? resources.filter((r) => {
            try {
                const result = fp(r, whereExpr);
                return result.length > 0 && result[0] !== false && result[0] != null;
            } catch {
                return false;
            }
        })
        : resources;

    const total = filtered.length;

    // Sort
    let sorted = filtered;
    if (query.orderBy) {
        const orderExpr = resolveRelativeDates(query.orderBy);
        const dir = query.orderDir === 'desc' ? -1 : 1;
        sorted = [...filtered].sort((a, b) => {
            const av = unwrap(fp(a, orderExpr));
            const bv = unwrap(fp(b, orderExpr));
            if (av == null && bv == null) return 0;
            if (av == null) return dir;
            if (bv == null) return -dir;
            return av < bv ? -dir : av > bv ? dir : 0;
        });
    }

    // Paginate
    const offset = query.offset ?? 0;
    const limit = Math.min(query.limit ?? HARD_LIMIT, HARD_LIMIT);
    const page = sorted.slice(offset, offset + limit);
    const truncated = total > offset + limit;

    // Project
    const selectEntries = Object.entries(query.select);
    const data = page.map((r) => {
        const row: Record<string, unknown> = {};
        for (const [alias, expr] of selectEntries) {
            try {
                row[alias] = unwrap(fp(r, resolveRelativeDates(expr)));
            } catch {
                row[alias] = null;
            }
        }
        return row;
    });

    const fields = selectEntries.map(([alias]) => alias);

    return { data, total, truncated, fields };
}

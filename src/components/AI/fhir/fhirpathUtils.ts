/**
 * Resolve $now-based relative date tokens to ISO strings before passing to fhirpath.
 * Supported: $now, $now-Nd (days), $now-Nw (weeks), $now-Nm (months), $now-Ny (years)
 */
export function resolveRelativeDates(expr: string): string {
    const now = new Date();

    return expr.replace(/\$now(?:-(\d+)([dwmy]))?/g, (_, n, unit) => {
        if (!n) return now.toISOString().slice(0, 10);
        const count = parseInt(n, 10);
        const d = new Date(now);
        switch (unit) {
            case 'd': d.setDate(d.getDate() - count); break;
            case 'w': d.setDate(d.getDate() - count * 7); break;
            case 'm': d.setMonth(d.getMonth() - count); break;
            case 'y': d.setFullYear(d.getFullYear() - count); break;
        }
        return d.toISOString().slice(0, 10);
    });
}

/** Unwrap a fhirpath result array to a scalar or null. */
export function unwrap(result: unknown[]): unknown {
    if (!result || result.length === 0) return null;
    if (result.length === 1) return result[0];
    return result;
}

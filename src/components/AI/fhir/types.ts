export type FhirQuery = {
    from: string;
    select: Record<string, string>;
    where?: string;
    orderBy?: string;
    orderDir?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
};

export type QueryResult = {
    data: Record<string, unknown>[];
    total: number;
    truncated: boolean;
    fields: string[];
};

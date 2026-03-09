import { useMemo, useState, type CSSProperties } from 'react';
import "./DataGrid.scss";


type AnyObj = { [k: string]: any };
export interface GridColumn {
    key: string;
    label: string;
    cellStyle?: CSSProperties;
    dataType?: string;
    renderer?: (item: AnyObj) => React.ReactNode;
};

function inferColumns(items: AnyObj[], maxCols = 12): GridColumn[] {
    const cols: GridColumn[] = [];
    for (const it of items) {
        if (!it || typeof it !== 'object') continue;
        for (const k of Object.keys(it)) {
            if (!cols.some(c => c.key === k)) {
                cols.push({
                    key: k,
                    label: k,
                    cellStyle: {
                        maxWidth: k === 'id' ?
                            '8rem' :
                            k.match(/date/i) ? '12rem' : undefined
                    },
                });
            }
            if (cols.length >= maxCols) break;
        }
        if (cols.length >= maxCols) break;
    }
    return cols;
}

function toCellString(v: any) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (v instanceof Date) return v.toISOString();
    try {
        if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).slice(0,3).join(', ');
        if (typeof v === 'object') {
            // prefer display or id if present
            if ('display' in v) return String(v.display);
            if ('id' in v) return String(v.id);
            // shallow stringify
            return Object.entries(v).slice(0,3).map(([k,val]) => `${k}:${typeof val==='object'?JSON.stringify(val):String(val)}`).join(', ');
        }
    } catch (e) {
        return String(v);
    }
    return String(v);
}

export default function DataGrid({
    items,
    columns,
    pageSize = 10,
}: {
    items: AnyObj[];
    columns?: GridColumn[];
    pageSize?: number;
}) {
    const inferred = useMemo(() => inferColumns(items || []), [items]);
    const cols = columns && columns.length ? columns : inferred;

    const [filter, setFilter] = useState('');
    const [sortCol, setSortCol] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc');
    const [page, setPage] = useState(0);

    const filtered = useMemo(() => {
        if (!filter) return items || [];
        const q = filter.toLowerCase();
        return (items || []).filter((it) => {
            return cols.some((c) => String(toCellString((it as AnyObj)[c.key] || '')).toLowerCase().includes(q));
        });
    }, [items, filter, cols]);

    const sorted = useMemo(() => {
        if (!sortCol) return filtered;
        const s = [...filtered].sort((a,b) => {
            const av = toCellString((a as AnyObj)[sortCol]);
            const bv = toCellString((b as AnyObj)[sortCol]);
            if (av === bv) return 0;
            if (sortDir === 'asc') return av < bv ? -1 : 1;
            return av > bv ? -1 : 1;
        });
        return s;
    }, [filtered, sortCol, sortDir]);

    const totalPages = Math.max(1, Math.ceil((sorted || []).length / pageSize));
    const pageItems = (sorted || []).slice(page * pageSize, page * pageSize + pageSize);

    function toggleSort(col: string) {
        if (sortCol !== col) {
            setSortCol(col);
            setSortDir('asc');
            return;
        }
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    }

    return (
        <div className="data-grid">
            <div className="d-flex justify-content-between align-items-center mb-2">
                <div>
                    <input className="form-control form-control-sm" placeholder="Filter..." value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0); }} />
                </div>
                <div className="small text-muted">{(items||[]).length} rows</div>
            </div>

            <div className="table-responsive small">
                <table className="table table-sm table-hover align-middle">
                    <thead>
                        <tr>
                            {cols.map((c) => (
                                <th
                                    key={c.key}
                                    style={{ cursor: 'pointer' }}
                                    className='text-start text-truncate'
                                    onClick={() => toggleSort(c.key)}
                                >
                                    {c.label || c.key} {sortCol === c.key ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                                </th>
                            ))}
                            {/* <th /> */}
                        </tr>
                    </thead>
                    <tbody>
                        {pageItems.map((it, idx) => (
                            <tr key={(it && (it.id||it.resourceType||idx)) + String(idx)}>
                                {cols.map((c) => (
                                    <td
                                        key={c.key}
                                        className={ "align-top text-start text-truncate" + (c.dataType ? " " + c.dataType : "") }
                                        style={c.cellStyle}
                                        title={String(toCellString((it as AnyObj)[c.key] || ''))}
                                    >
                                        { c.renderer ? c.renderer((it as AnyObj)[c.key]) : toCellString((it as AnyObj)[c.key]) }
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="d-flex justify-content-between align-items-center mt-2">
                <div>
                    <button className="btn btn-sm btn-outline-secondary me-2" onClick={() => setPage(0)} disabled={page===0}>First</button>
                    <button className="btn btn-sm btn-outline-secondary me-2" onClick={() => setPage((p) => Math.max(0, p-1))} disabled={page===0}>Prev</button>
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => setPage((p) => Math.min(totalPages-1, p+1))} disabled={page>=totalPages-1}>Next</button>
                </div>
                <div className="small text-muted">Page {page+1} / {totalPages}</div>
            </div>
        </div>
    );
}

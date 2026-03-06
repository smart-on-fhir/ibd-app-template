import "./ResourceTypeSelector.scss";


export default function ResourceTypeSelector({ map, selection, onChange, enabled }: { map: Map<string, number>, selection: string[], onChange: (selection: string[]) => void, enabled?: Set<string> }) {
    return (
        <div className="resource-type-selector" tabIndex={-1}>
            <div className="d-inline-flex align-items-center gap-1 dropdown-toggle">
                Resource Types {selection.length > 0 ? <small className='badge rounded-pill bg-primary fw-normal'>{selection.length}</small> : '' }
            </div>
            <div className="backdrop" onClick={e => e.currentTarget.parentElement?.blur()} />
            <ul className="dropdown-menu shadow-sm dropdown-menu-end">
                { Array.from(map.keys()).map(resourceType => {
                    const isDisabled = enabled !== undefined && !enabled.has(resourceType);
                    return (
                    <li key={resourceType}
                        className={'dropdown-item small' + (isDisabled ? ' disabled opacity-50' : '')}
                        onClick={() => {
                            if (isDisabled) return;
                            onChange(selection.includes(resourceType) ? selection.filter(f => f !== resourceType) : [...selection, resourceType]);
                        }}
                    >
                        <div className='d-flex align-items-center gap-2' style={{ cursor: isDisabled ? 'not-allowed' : 'pointer' }}>
                            <i className={'bi ' + (selection.includes(resourceType) && !isDisabled ? 'bi-check-square-fill text-primary' : 'bi-square opacity-50')} />
                            <span className='flex-grow-1'>{resourceType}</span>
                            <small className='opacity-50 ms-2'><small>{map.get(resourceType)}</small></small>
                        </div>
                    </li>
                    );
                })}
                <li><hr className="dropdown-divider" /></li>
                <li className='dropdown-item d-flex align-items-center gap-2 small' style={{ cursor: 'pointer' }} onClick={() => {
                    const activeKeys = enabled ? Array.from(map.keys()).filter(k => enabled.has(k)) : Array.from(map.keys());
                    const allSelected = activeKeys.every(resourceType => selection.includes(resourceType));
                    onChange(allSelected ? [] : activeKeys);
                }}>
                    <i className={'bi bi-square opacity-0'} />
                    <span>Toggle All</span>
                </li>
            </ul>
        </div>
    );
}
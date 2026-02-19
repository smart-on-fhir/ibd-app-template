import "./ResourceTypeSelector.scss";


export default function ResourceTypeSelector({ map, selection, onChange }: { map: Map<string, number>, selection: string[], onChange: (selection: string[]) => void }) {
    return (
        <div className="resource-type-selector" tabIndex={-1}>
            <div className="d-inline-flex align-items-center gap-1 dropdown-toggle">
                Resource Types {selection.length > 0 ? <small className='badge rounded-pill bg-primary fw-normal'>{selection.length}</small> : '' }
            </div>
            <div className="backdrop" onClick={e => e.currentTarget.parentElement?.blur()} />
            <ul className="dropdown-menu shadow-sm dropdown-menu-end">
                { Array.from(map.keys()).map(resourceType => (
                    <li key={resourceType} className='dropdown-item' onClick={() => {
                        onChange(selection.includes(resourceType) ? selection.filter(f => f !== resourceType) : [...selection, resourceType]);
                    }}>
                        <div className='d-flex align-items-center gap-2' style={{ cursor: 'pointer' }}>
                            <i className={'bi ' + (selection.includes(resourceType) ? 'bi-check-square-fill text-primary' : 'bi-square opacity-50')} />
                            <span className='flex-grow-1'>{resourceType}</span>
                            <small className='opacity-50 ms-2'><small>{map.get(resourceType)}</small></small>
                        </div>
                    </li>
                ))}
                <li><hr className="dropdown-divider" /></li>
                <li className='dropdown-item d-flex align-items-center gap-2' style={{ cursor: 'pointer' }} onClick={() => {
                    const allSelected = Array.from(map.keys()).every(resourceType => selection.includes(resourceType));
                    onChange(allSelected ? [] : Array.from(map.keys()));
                }}>
                    <i className={'bi bi-square opacity-0'} />
                    <span>Toggle All</span>
                </li>
            </ul>
        </div>
    );
}
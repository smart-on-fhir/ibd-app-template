import type { ConditionPreset } from './conditionPresets';

export default function ConditionPresetFilter({
    presets,
    selected,
    onChange,
}: {
    presets : ConditionPreset[];
    selected: string[];
    onChange: (ids: string[]) => void;
}) {
    const toggle = (id: string) =>
        onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);

    return (
        <div className='d-flex align-items-center gap-1 flex-wrap'>
            <span className='text-muted me-1' style={{ whiteSpace: 'nowrap' }}>Condition:</span>
            {presets.map(p => {
                const active = selected.includes(p.id);
                return (
                    <button
                        key={p.id}
                        title={p.description}
                        onClick={() => toggle(p.id)}
                        className='btn btn-sm'
                        style={{
                            fontSize       : '13px',
                            lineHeight     : '1.2',
                            padding        : '2px 10px',
                            borderRadius   : '20px',
                            border         : `1.5px solid ${p.color}`,
                            backgroundColor: active ? p.color : 'transparent',
                            color          : active ? '#fff' : p.color,
                            fontWeight     : active ? 600 : 400,
                            transition     : 'all 0.12s',
                        }}
                    >
                        {p.label}
                    </button>
                );
            })}
            {selected.length > 0 && (
                <button
                    className='btn btn-sm text-muted'
                    style={{ fontSize: '11px', padding: '2px 7px', lineHeight: '1.2' }}
                    title='Clear condition filters'
                    onClick={() => onChange([])}
                >
                    ✕
                </button>
            )}
        </div>
    );
}

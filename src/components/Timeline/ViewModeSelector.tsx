import type { Lens } from './lenses';

const LENS_COLOR = '#318ebc';

export default function ViewModeSelector({
    modes,
    selected,
    onChange,
}: {
    modes   : Lens[];
    selected: string;
    onChange: (id: string) => void;
}) {
    return (
        <div className='d-flex align-items-center gap-1 flex-wrap'>
            <span className='text-muted me-1' style={{ whiteSpace: 'nowrap' }}>View:</span>
            {modes.map(m => {
                const active = selected === m.id;
                return (
                    <button
                        key={m.id}
                        title={m.description}
                        onClick={() => onChange(m.id)}
                        className='btn btn-sm'
                        style={{
                            fontSize       : '13px',
                            lineHeight     : '1.2',
                            padding        : '2px 10px',
                            borderRadius   : '20px',
                            border         : `1.5px solid ${LENS_COLOR}`,
                            backgroundColor: active ? LENS_COLOR : 'transparent',
                            color          : active ? '#fff' : LENS_COLOR,
                            fontWeight     : active ? 600 : 400,
                            transition     : 'all 0.12s',
                        }}
                    >
                        <i className={`bi ${m.icon} me-1`} />
                        {m.label}
                    </button>
                );
            })}
        </div>
    );
}

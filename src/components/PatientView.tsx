
import { useEffect, useMemo }         from 'react';
import { NavLink, Outlet, useParams } from 'react-router-dom';
import { usePatientContext }          from '../contexts/PatientContext';
import { MODULE_REGISTRY }            from '../modules/registry';

const OPENAI_ENABLED = !!import.meta.env.VITE_OPENAI_API_KEY;


export default function PatientView() {
    const { id } = useParams();

    const {
        setSelectedPatient,
        selectedPatientResources,
        selectedPatientSummary,
        selectedPatientLoading
    } = usePatientContext();

    useEffect(() => {
        setSelectedPatient(id + "");
    }, [id]);

    const totalItems = Object.values(selectedPatientResources).reduce((s, arr) => s + (arr?.length || 0), 0);

    const activeModules = useMemo(
        () => MODULE_REGISTRY.filter(m => m.detect(selectedPatientResources)),
        [selectedPatientResources]
    );

    return (
        <div className='d-flex gap-2 flex-nowrap'>
            <div className='flex-auto small' style={{ minWidth: '300px' }}>
                <div className='flex-column nav nav-pills position-sticky top-0'>
                    <NavLink to="." className='d-flex gap-2 text-decoration-none nav-link py-1 fw-bold' end>
                        <i className="bi bi-person-circle" />
                        <span>Patient Summary</span>
                    </NavLink>
                    <NavLink to="./timeline" className='d-flex gap-2 text-decoration-none nav-link py-1 fw-bold'>
                        <i className="bi bi-person-lines-fill" />
                        <span>Patient Timeline</span>
                    </NavLink>
                    {OPENAI_ENABLED && (
                    <NavLink to={`./chat`} className='d-flex gap-2 text-decoration-none nav-link py-1 fw-bold'>
                        <i className="bi bi-chat-dots" />
                        <span>AI Chat</span>
                    </NavLink>
                    )}
                    {activeModules.length > 0 && (<>
                        <div className='px-3 py-1 text-muted fw-bold mt-2' style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Disease Views
                        </div>
                        {activeModules.map(mod => (
                            <NavLink key={mod.id} to={`./${mod.basePath}`} className='d-flex gap-2 text-decoration-none nav-link py-1 fw-bold'>
                                <i className={`bi ${mod.icon}`} style={{ color: mod.color }} />
                                <span>{mod.label}</span>
                            </NavLink>
                        ))}
                        <hr />
                    </>)}
                    <div className='d-flex gap-2 text-decoration-none px-3 py-1 fw-bold text-secondary'>
                        <i className="bi bi-folder2-open" />
                        <span className='flex-grow-1'>Resources:</span>
                        <span className='opacity-50 fw-normal'>
                            {totalItems}
                            { selectedPatientLoading && (
                                <span className="ms-1">
                                    <span className="spinner-border spinner-border text-success small text-muted opacity-50" role="status" style={{
                                        width   : '1rem',
                                        height  : '1rem',
                                        fontSize: '0.75rem'
                                    }} />
                                </span>
                            )}
                        </span>
                    </div>
                    <div className='ps-4'>
                    {Object.entries(selectedPatientResources).filter(([, arr]) => arr.length > 0).map(([t, arr]) => (
                        <NavLink to={`./${t}`} key={t} className='d-flex gap-2 justify-content-between text-decoration-none nav-link py-1'>
                            <span>{t}</span>
                            <span className='opacity-50'>{arr.length}</span>
                        </NavLink>
                    ))}
                    </div>
                </div>
            </div>
            <div className="overflow-auto d-flex flex-column flex-grow-1 ps-3">
                { selectedPatientSummary && <Outlet /> }
            </div>
        </div>
    );
}

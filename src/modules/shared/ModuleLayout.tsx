import { NavLink, Outlet, useParams } from 'react-router-dom';

interface Props {
    basePath:       string;
    label:          string;
    icon:           string;
    color?:         string;
    navLinks?:      Array<{ path: string; label: string; icon: string }>;
    sidebarFooter?: React.ReactNode;
}

export default function ModuleLayout({ basePath, label, icon, color, navLinks, sidebarFooter }: Props) {
    const { id } = useParams();
    const base = `/patients/${id}/${basePath}`;

    const links = navLinks ?? [{ path: '', label, icon }];

    return (
        <div className='d-flex gap-2 flex-nowrap'>
            <div className='flex-auto small' style={{ minWidth: '201px' }}>
                <div className='flex-column nav nav-pills position-sticky top-0'>
                    <NavLink
                        to={`/patients/${id}`}
                        className='d-flex gap-2 text-decoration-none nav-link py-1 text-muted'
                        end
                    >
                        <i className="bi bi-arrow-left" />
                        <span>Patient Summary</span>
                    </NavLink>

                    <div className='px-3 py-1 text-muted fw-bold mt-2'
                         style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {label}
                    </div>

                    {links.map(link => (
                        <NavLink
                            key={link.path}
                            to={link.path ? `${base}/${link.path}` : base}
                            end
                            className='d-flex gap-2 text-decoration-none nav-link py-1 fw-bold'
                        >
                            <i className={`bi ${link.icon}`} style={color ? { color } : undefined} />
                            <span>{link.label}</span>
                        </NavLink>
                    ))}
                    {sidebarFooter}
                </div>
            </div>

            <div className="d-flex flex-column flex-grow-1 ps-3 min-w-0" style={{ minWidth: 0 }}>
                <Outlet />
            </div>
        </div>
    );
}

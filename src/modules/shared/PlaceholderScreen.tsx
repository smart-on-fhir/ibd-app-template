interface Props {
    label:       string;
    icon:        string;
    description: string;
    color?:      string;
}

export default function PlaceholderScreen({ label, icon, description, color }: Props) {
    return (
        <div className="container-fluid py-4">
            <div className="d-flex align-items-center gap-3 mb-4">
                <i className={`bi ${icon} fs-1 opacity-75`} style={color ? { color } : undefined} />
                <div>
                    <h5 className="mb-0">{label}</h5>
                    <p className="text-muted small mb-0">{description}</p>
                </div>
            </div>
            <div className="alert alert-secondary d-flex align-items-center gap-2" style={{ maxWidth: '480px' }}>
                <i className="bi bi-hourglass-split flex-shrink-0" />
                <span>Module detected for this patient. Full dashboard coming soon.</span>
            </div>
        </div>
    );
}

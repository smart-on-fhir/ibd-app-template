export default function Loader({ className }: { className?: string }) {
    return (
        <div className={`spinner-border ${className || ''}`} role="status" style={{
            width   : '1rem',
            height  : '1rem',
            fontSize: '0.75rem'
        }}>
            <span className="visually-hidden">Loading...</span>
        </div>
    );
}

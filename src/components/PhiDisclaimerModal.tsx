import { useState } from 'react';

const SHOW        = import.meta.env.VITE_SHOW_PHI_DISCLAIMER === 'true';
const COOKIE_NAME = 'phi_disclaimer_accepted';

function hasCookie(): boolean {
    return document.cookie.split(';').some(c => c.trim().startsWith(COOKIE_NAME + '='));
}

function setAcceptedCookie() {
    const expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toUTCString(); // 90 days
    document.cookie = `${COOKIE_NAME}=1; expires=${expires}; path=/; SameSite=Strict`;
}

export default function PhiDisclaimerModal() {
    const [visible,  setVisible]  = useState(() => SHOW && !hasCookie());
    const [accepted, setAccepted] = useState(false);

    if (!visible) return null;

    function handleAgree() {
        setAcceptedCookie();
        setVisible(false);
    }

    return (
        <>
            <div className="modal show d-block" tabIndex={-1} style={{ zIndex: 10050 }}>
                <div className="modal-dialog modal-dialog-centered">
                    <div className="modal-content">
                        <div className="modal-header bg-warning-subtle border-warning">
                            <h5 className="modal-title fw-semibold">
                                <i className="bi bi-shield-exclamation me-2 text-warning" />
                                Privacy &amp; Security Notice
                            </h5>
                        </div>
                        <div className="modal-body">
                            <p>
                                This application is <strong>not running in a secure or HIPAA-compliant
                                environment</strong> and is intended for development and demonstration purposes only.
                            </p>
                            <p>
                                <strong>Do not upload or enter real Protected Health Information (PHI).</strong>{' '}
                                If you choose to do so anyway, you acknowledge that:
                            </p>
                            <ul>
                                <li>Your data may not be adequately protected or encrypted.</li>
                                <li>The responsibility for any resulting privacy or compliance risk rests entirely with you.</li>
                            </ul>
                            <div className="form-check mt-3">
                                <input
                                    type="checkbox"
                                    className="form-check-input"
                                    id="phi-disclaimer-check"
                                    checked={accepted}
                                    onChange={e => setAccepted(e.target.checked)}
                                />
                                <label className="form-check-label" htmlFor="phi-disclaimer-check">
                                    I understand and accept the risks described above.
                                </label>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button
                                className="btn btn-primary"
                                disabled={!accepted}
                                onClick={handleAgree}
                            >
                                Continue
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <div className="modal-backdrop show" style={{ zIndex: 10040 }} />
        </>
    );
}

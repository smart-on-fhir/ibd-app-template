import { useEffect, useRef } from "react";

export default function ChatInput({ loading, value, onChange, onSubmit }: { loading: boolean, value: string, onChange: (value: string) => void, onSubmit: () => void }) {
    
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        textareaRef.current!.style.height = 'auto';
        const timer = requestAnimationFrame(() => {
            if (textareaRef.current) {
                textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
            }
        });
        return () => {
            cancelAnimationFrame(timer);
        };
    }, [value]);

    return (
        <div className={ "ai-chat-input" + (loading ? ' loading' : '') }>
            <fieldset className="form-control p-2" disabled={loading}>
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(e) => { onChange(e.target.value); }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
                            e.preventDefault();
                            onSubmit();
                        }
                    }}
                    rows={1}
                    aria-label="AI chat input"
                    placeholder='Ask anything about the patient'
                />
                <div className="buttons">
                    <button type="button" disabled={loading || !value} className='btn-submit bi bi-arrow-up-circle-fill' tabIndex={0} onClick={loading || !value ? undefined : onSubmit } />
                    <div className="spinner-border" role="status">
                        <span className="visually-hidden">Loading...</span>
                    </div>
                </div>
            </fieldset>
        </div>
    );
}
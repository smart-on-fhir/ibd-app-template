import { useCallback, useEffect, useRef, useState } from 'react';
import MarkDown                                     from './MarkDown';
import ChatInput                                    from './ChatInput';
import { askLLM }                                   from './askLLM';
import { usePatientContext }                        from '../../contexts/PatientContext';
import "./chat.scss";


export default function AIChat() {
    const [value   , setValue   ] = useState('');
    const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant' | 'system'; content: string }>>([]);
    const [loading , setLoading ] = useState(false);
    const messagesRef             = useRef<HTMLDivElement | null>(null);
    const { database }            = usePatientContext();

    const ask = useCallback(() => {
        if (value && database) {
            setLoading(true);
            setMessages((msgs) => [...msgs, { role: 'user', content: value }]);
            setValue('');
            askLLM(value, database)
            .then((output) => {
                setMessages((msgs) => [...msgs, { role: 'assistant', content: output }]);
            }).catch((err) => {
                setMessages((msgs) => [...msgs, { role: 'system', content: `LLM error: ${err}` }]);
            }).finally(() => {
                setLoading(false);
            });
        }
    }, [database, value]);
    
    useEffect(() => {
        const div = messagesRef.current;
        let timeout: NodeJS.Timeout | undefined;
        if (div) {
            timeout = setTimeout(() => {
                div.scrollTo({ left: 0, top: div.scrollHeight, behavior: 'smooth' });
            }, 20);
        }
        return () => {
            if (timeout) clearTimeout(timeout);
        };
    }, [messages, loading]);

    return (
        <div className="d-flex flex-column gap-3" style={{ maxHeight: 'calc(100vh - 10rem)' }}>
            <div className='flex-1 overflow-auto' ref={messagesRef}>
                <div className='ai-chat-messages'>
                    { messages.map((msg, i) => {
                        const content = msg.content.trim();
                        if (!content || content.length === 0) return null;
                        if (msg.role === 'assistant') {
                            return (
                                <div key={i} className="assistant">
                                    <MarkDown>{content}</MarkDown>
                                </div>
                            );
                        }
                        else if (msg.role === 'system') {
                            return (
                                <div key={i} className="system">
                                    <strong>System message:</strong> {content}
                                </div>
                            );
                        }
                        else if (msg.role === 'user') {
                            return (
                                <div key={i} className="user">
                                    <div className="d-inline-block text-primary-emphasis bg-primary-subtle px-3 py-2 rounded-3">
                                        <i className="fa bi-person-fill me-2"/>
                                        {content}
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    }) }
                </div>
            </div>
            <ChatInput loading={loading} value={value} onChange={setValue} onSubmit={ask} />
        </div>
    );
}


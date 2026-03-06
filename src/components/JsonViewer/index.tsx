import type { JSONValue } from "../../types";
import Collapse           from "../Collapse";


export default function JsonViewer({
    data,
    path = '',
    renderValue = (v) => String(v),
    root = data
}: {
    data: JSONValue,
    renderValue?: (v: string | number | boolean | null, path?: string, root?: JSONValue) => React.ReactNode,
    path?: string,
    root?: JSONValue
}) {
    if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean' || data === null) {
        return <div className="ps-3">{renderValue(data, path || String(data), root)}</div>;
    }

    if (Array.isArray(data)) {
        return (
            <div className="ps-3">
                {data.map((item, index) => (
                    <Collapse key={index} label={<b>{index}</b>}>
                        <JsonViewer data={item} renderValue={renderValue} path={`${path}[${index}]`} root={root} />
                    </Collapse>
                ))}
            </div>
        );
    }

    if (data && typeof data === 'object') {
        path = path || String(data.resourceType);
        return (
            <div className="ps-3">
                {Object.entries(data).map(([key, value], idx) => {
                    if (value === undefined) {
                        return (
                            <div key={idx} className="d-flex gap-1 ps-3 w-100">
                                <b>{key}:</b>
                                <i className="text-secondary opacity-50">undefined</i>
                            </div>
                        );
                    }
                    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
                        return (
                            <div key={idx} className="d-flex gap-1 ps-3 w-100">
                                <b>{key}:</b>
                                <div className="flex-grow-1">{renderValue(value, `${path}.${key}`, root)}</div>
                            </div>
                        );
                    }
                    return (
                        <Collapse label={<b>{key}</b>} key={idx}>
                            <JsonViewer data={value} renderValue={renderValue} path={`${path}.${key}`} root={root} />
                        </Collapse>
                    )
                })}
            </div>
        );
    }

    return <div className="ps-3 text-secondary opacity-50">undefined</div>;
}

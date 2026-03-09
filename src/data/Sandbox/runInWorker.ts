import type { ClinicalAPI } from "../types";

export function runInWorker(
    code: string,
    apiHandlers: ClinicalAPI,
    timeoutMs = 100
): Promise<any> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });

        

        worker.onmessage = (e) => {

            const timeout = setTimeout(() => {
                worker.terminate();
                reject(new Error("Execution timeout"));
            }, timeoutMs);

            // console.log("Worker message:", e.data);
            const msg = e.data;

            if (msg.type === "rpc") {
                const { id, method, args } = msg;

                if (!(method in apiHandlers)) {
                    worker.postMessage({ id, error: "Method not allowed" });
                    return;
                }

                try {
                    // @ts-ignore
                    const result = apiHandlers[method as keyof ClinicalAPI](...args);
                    worker.postMessage({ id, result });
                } catch (err: any) {
                    worker.postMessage({ id, error: err.message });
                }
                return;
            }

            if (msg.type === "result") {
                clearTimeout(timeout);
                worker.terminate();
                resolve(msg.result);
            }

            if (msg.type === "error") {
                clearTimeout(timeout);
                worker.terminate();
                reject(new Error(msg.error));
            }
        };

        worker.postMessage({ type: "execute", code });
    });
}

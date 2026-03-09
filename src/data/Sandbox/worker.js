/* ------------------------------- RPC PROXY -------------------------------- */

function createApiProxy() {
    return new Proxy({}, {
        get(_, method) {
            
            /**
             * RPC method call
             * @param args {any[]}
             * @returns {Promise<any>}
             */
            return (...args) => new Promise((resolve, reject) => {
                const id = crypto.randomUUID();
                postMessage({ type: "rpc", id, method, args });

                /**
                 * Handle RPC response
                 * @param e {MessageEvent<{ id: string, result: any, error?: string }>}
                 */
                const handler = (e) => {
                    if (e.data.id !== id) return;
                    removeEventListener("message", handler);
                    if ("error" in e.data) {
                        reject(new Error(e.data.error));
                    } else {
                        resolve(e.data.result);
                    }
                };
                addEventListener("message", handler);
            });
        }
    });
}

/* ------------------------------- EXECUTION -------------------------------- */

self.onmessage = async (e) => {
    if (e.data.type !== "execute") return;

    const { code } = e.data;

    try {
        const api = createApiProxy();
        // console.log("Worker executing code:", code);

        // SAFE because AST already validated
        const runFn = eval(`
            (() => {
                ${code}
                if (typeof run !== "function") {
                throw new Error("run(api) not defined");
                }
                return run;
            })()
        `);

        const result = await runFn(api);

        // Send back the result
        postMessage({ type: "result", result });
    }
    catch (err) {
        // @ts-ignore err will be Error and will be serialized as string
        postMessage({ type: "error", error: err.toString() });
    }
};

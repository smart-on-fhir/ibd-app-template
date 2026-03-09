import { validateAST }    from "./ast/validateAST";
import { runInWorker }    from "./runInWorker";
import type { Database }  from "../types";
import { getClinicalAPI } from "../api";


export function execute(code: string, database: Database): Promise<any> {
    validateAST(code);
    return runInWorker(code, getClinicalAPI(database));
}

declare type Patient = {
    name: string;
    mrn: string;
    dob: string // YYYY-MM-DD format
    gender: string;
    description: string;

    populationData: PopulationDataRow[]

    value: number;

    population: {
        screenshot: ReactNode,
        tableRows: {
           drugClass: string;
           patients : number;
           boxplot  : [number, number, number, number, number] 
        }[]
    }
};

declare type PopulationDataRow = {
    label: ReactNode;
    surgery: ReactNode;
    responder: ReactNode;
    nonResponder: ReactNode;
};

export type PicklistValueSchema = {
    active: boolean;
    defaultValue: boolean;
    label: string;
    validFor: string[] | null;
    value: string;
};

export type PicklistResult = {
    typeDefs: string[];
    typeNames: Map<string, string>;
};
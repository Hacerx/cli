export type FlagDefinition<T = any> = {
    char?: string;
    description: string;
    defaultValue?: T;
    parseArg?: (value: string, previous: any) => T;
    // regexp?: RegExp;
    required?: boolean;
    type?: 'string' | 'integer' | 'boolean' | 'float' | 'array';
}

export type Flags = {
    [key: string]: FlagDefinition;
}

type InferFlagType<F extends FlagDefinition> =
    F extends FlagDefinition<infer T> ? T : never;

type InferOptions<F extends Flags> = {
    [K in keyof F]: InferFlagType<F[K]>;
}

type Camelize<T extends string> = T extends `${infer A}-${infer B}` ? `${A}${Camelize<Capitalize<B>>}` : T

type CamelizeKeys<T extends object> = {
  [key in keyof T as key extends string ? Camelize<key> : key]: T[key]
}

declare const _: unique symbol;
type NoOverride = { [_]: typeof _; }


export const FlagType = {
    string: (def: FlagDefinition<string>) => { def.type = 'string'; return def; },
    integer: (def: FlagDefinition<number>) => { def.type = 'integer'; return def; },
    boolean: (def: FlagDefinition<boolean>) => { def.type = 'boolean'; return def; },
    float: (def: FlagDefinition<number>) => { def.type = 'float'; return def; },
    array: <T=string>(def: FlagDefinition<T[]>) => { def.type = 'array'; return def; },
}

export abstract class CommandBase<T extends Flags = Flags> {

    abstract description: string;
    abstract run(): void | Promise<void>;
    abstract flags: T;

    options: CamelizeKeys<InferOptions<T>> = {} as CamelizeKeys<InferOptions<T>>;

    action = (options: CamelizeKeys<InferOptions<T>>): void & NoOverride => {
        this.options = options;
        this.run?.();
    }

}
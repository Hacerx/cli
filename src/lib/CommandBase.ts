import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type FlagDefinition<T = any> = {
    char?: string;
    description: string;
    defaultValue?: T;
    parseArg?: (value: string, previous: any) => T;
    // regexp?: RegExp;
    required?: boolean;
    type?: 'string' | 'integer' | 'boolean' | 'float' | 'array';
    /**
     * Called when no value is provided for this flag.
     * If it returns a value, that value is used as the default.
     * If it returns undefined and the flag is required, an error is thrown.
     */
    resolveDefault?: () => string | undefined;
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

function resolveSfOrg(): string | undefined {
    try {
        const configPath = join(process.cwd(), '.sf', 'config.json');
        if (existsSync(configPath)) {
            const config = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, string>;
            return config['target-org'] ?? undefined;
        }
    } catch {
        // ignore read/parse errors
    }
    return undefined;
}

export const FlagType = {
    string: (def: FlagDefinition<string>) => { def.type = 'string'; return def; },
    integer: (def: FlagDefinition<number>) => { def.type = 'integer'; return def; },
    boolean: (def: FlagDefinition<boolean>) => { def.type = 'boolean'; return def; },
    float: (def: FlagDefinition<number>) => { def.type = 'float'; return def; },
    array: <T=string>(def: FlagDefinition<T[]>) => { def.type = 'array'; return def; },
    /**
     * Salesforce org flag (-u / --username).
     * If no value is provided, falls back to `target-org` in `.sf/config.json`.
     * If the flag is required and neither source provides a value, the CLI exits with an error.
     */
    sfOrg: (def: Omit<FlagDefinition<string>, 'resolveDefault'>) => {
        const flagDef = def as FlagDefinition<string>;
        flagDef.type = 'string';
        flagDef.resolveDefault = resolveSfOrg;
        return flagDef;
    },
}

export type Example = {
    description: string;
    command: string;
};

export abstract class CommandBase<T extends Flags = Flags> {

    abstract description: string;
    abstract run(): void | Promise<void>;
    abstract flags: T;

    examples?: Example[];

    options: CamelizeKeys<InferOptions<T>> = {} as CamelizeKeys<InferOptions<T>>;

    action = (options: CamelizeKeys<InferOptions<T>>): void & NoOverride => {
        this.options = options;
        this.run?.();
    }

}

import { getConnection , getAllSobjects } from "../../../lib/sf.js";
import { CommandBase, FlagType } from "../../../lib/CommandBase.js";
import { wildTest } from "../../../lib/strings.js";
// @ts-ignore
import { getOrgsMap } from '@hacerx/sf-auth-decrypt'
import { writeFile } from '../../../lib/files.js';
import { normalize } from "node:path";
import { Connection } from "@jsforce/jsforce-node";
import { generateTypes } from "../../../lib/types/object.js";

const flags = {
    sobject: FlagType.array<string>({
        char: 's',
        description: 'SObject(s) to get types for',
        required: true
    }),
    'output-dir': FlagType.string({
        char: 'o',
        description: 'Output directory',
        required: false,
        defaultValue: './types/'
    }),
    username: FlagType.string({
        char: 'u',
        description: 'Salesforce username',
        required: true
    }),
    'case-insensitive': FlagType.boolean({
        char: 'i',
        description: 'Case insensitive SObject names',
        required: false
    }),
    'declare-module': FlagType.boolean({
        char: 'b',
        description: 'Add declare module to the output file',
        required: false
    })
} as const;

export default class TestCommand extends CommandBase<typeof flags> {
    description = `SObject(s) to get types for

Get multiple types, either set multiple --sobject flags or a single --sobject flag with multiple names separated by spaces. Enclose names that contain spaces in one set of double quotes.

It can be used with the --case-insensitive flag to ignore the case of SObject names.

Allows wildcard characters * and ..`;

    flags = flags;

    private async generateFile(
        conn: Connection,
        sobject: string,
        outputDir: string
      ): Promise<{ sobject: string; type: string }> {
        console.log(`Processing ${sobject}`);
    
        const description = await conn.describe(sobject);
    
        let typed = await generateTypes(description);
        if (this.options.declareModule) {
          typed = `declare module '@salesforce/schema/${sobject}' { export const objectApiName: string; }\n${typed}`;
        }
        const outputFile = normalize(`${outputDir}/${description.name}.d.ts`);
        await writeFile(outputFile, typed);
    
        console.log(`Processed ${sobject} - ${outputFile}`);
        return { sobject, type: typed };
    }

    async run() {
        try{
            const conn = await getConnection(this.options.username);
            const wildcards = this.options.sobject?.filter((sobject) => sobject.includes('*') || sobject.includes('.')) || [];
            let allSObjects: string[] = [];
            let checkSObjects: string[] = [];
            if (wildcards.length > 0 || this.options.sobject?.length === 0) {
                allSObjects = await getAllSobjects(conn);
                checkSObjects = allSObjects.filter((sobject) =>
                    wildcards.some((wildcard) => wildTest(wildcard, sobject, this.options.caseInsensitive))
                );
            } else {
                checkSObjects = this.options.sobject || allSObjects;
            }

            await Promise.all(
                checkSObjects.map((sobject) => this.generateFile(conn, sobject, this.options.outputDir))
            );
        }catch(e){
            console.error(e);
        }
    }
}

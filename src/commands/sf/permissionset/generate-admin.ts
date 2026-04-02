import { getConnection, getAllPermissionableSobjects, getAllPermissionableFields } from "../../../lib/sf.js";
import { CommandBase, FlagType } from "../../../lib/CommandBase.js";
import { writeFile } from '../../../lib/files.js';
import { normalize } from "node:path";

const flags = {
    username: FlagType.string({
        char: 'u',
        description: 'Salesforce username',
        required: true
    }),
    'output-dir': FlagType.string({
        char: 'o',
        description: 'Output directory',
        required: false,
        defaultValue: './'
    })
} as const;

export default class GenerateAdmin extends CommandBase<typeof flags> {
    description = `Generate a permissionset for system admins with full permissions to all objects`;

    flags = flags;

    async run() {
        try {
            console.log(`Connecting to Salesforce using username ${this.options.username}...`);
            const conn = await getConnection(this.options.username);
            
            console.log(`Fetching all permission-enabled SObjects dynamically...`);
            const allSObjects = await getAllPermissionableSobjects(conn);
            
            console.log(`Fetching all permission-enabled Fields dynamically...`);
            const allFields = await getAllPermissionableFields(conn);
            
            console.log(`Found ${allSObjects.length} SObjects and ${allFields.length} Fields. Generating permission set...`);
            
            let xmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n`;
            xmlContent += `<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">\n`;
            xmlContent += `    <description>System Administrator Full Access for App Objects</description>\n`;
            xmlContent += `    <label>System Administrator Full Access</label>\n`;
            xmlContent += `    <hasActivationRequired>false</hasActivationRequired>\n`;
            
            for (const f of allFields) {
                xmlContent += `    <fieldPermissions>\n`;
                xmlContent += `        <editable>${f.editable}</editable>\n`;
                xmlContent += `        <field>${f.field}</field>\n`;
                xmlContent += `        <readable>true</readable>\n`;
                xmlContent += `    </fieldPermissions>\n`;
            }

            for (const sobject of allSObjects) {
                xmlContent += `    <objectPermissions>\n`;
                xmlContent += `        <allowCreate>true</allowCreate>\n`;
                xmlContent += `        <allowDelete>true</allowDelete>\n`;
                xmlContent += `        <allowEdit>true</allowEdit>\n`;
                xmlContent += `        <allowRead>true</allowRead>\n`;
                xmlContent += `        <modifyAllRecords>true</modifyAllRecords>\n`;
                xmlContent += `        <object>${sobject}</object>\n`;
                xmlContent += `        <viewAllRecords>true</viewAllRecords>\n`;
                xmlContent += `    </objectPermissions>\n`;
            }
            
            xmlContent += `</PermissionSet>\n`;

            const outputDir = this.options.outputDir || './';
            const outputFile = normalize(`${outputDir}/AdminFullAccess.permissionset-meta.xml`);
            await writeFile(outputFile, xmlContent);
        
            console.log(`Successfully generated permission set at ${outputFile}`);
        } catch (e) {
            console.error(e);
        }
    }
}

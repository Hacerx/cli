import { Connection } from "@jsforce/jsforce-node"
import { getOrgsMap } from '@hacerx/sf-auth-decrypt';

type GetConnectionOpts = {
    /**
     * API version in format 'XX.0'
     * @example '63.0'
     */
    apiVersion?: string,
    /**
     * Get max API version
     * @default false
     */
    maxApiVersion?: boolean
}

export async function getConnection(username: string, opts?: GetConnectionOpts) {
    const orgsMap = await getOrgsMap();

    let org = orgsMap[username] ?? Object.values(orgsMap).find((org) => org.username === username);
    if (!org) {
        throw new Error(`Org with username "${username}" not found`);
    }

    const conn = new Connection({
        instanceUrl: org.instanceUrl,
        accessToken: org.accessToken,
    });
    if(opts?.apiVersion) {
        conn.version = opts.apiVersion
    }else if(opts?.maxApiVersion) {
        const versions: {label: string, url: string, version: string}[] = await conn.request('/services/data')
        const maxApiVersion = versions?.reduce((max, version) => {
            if(version.version > max){
                return version.version
            }
            return max
        }, conn.version)
        conn.version = maxApiVersion;
    }else{
        conn.version = org.instanceApiVersion;
    }
    return conn
}

type EntityDefinition = {
    QualifiedApiName: string;
};

export async function getAllSobjects(conn: Connection): Promise<string[]> {
    const { records } = await conn.query(
      'SELECT QualifiedApiName FROM EntityDefinition WHERE IsCustomizable = true ORDER BY QualifiedApiName'
    );
    return (records as EntityDefinition[]).map((r) => r.QualifiedApiName);
  }

export async function getAllPermissionableSobjects(conn: Connection): Promise<string[]> {
    const { records } = await conn.query(
      "SELECT SobjectType FROM ObjectPermissions WHERE Parent.Profile.PermissionsModifyAllData = true LIMIT 5000"
    );
    const uniqueRecords = [...new Set(records.map((r: any) => r.SobjectType))];
    return uniqueRecords.sort();
}

export async function getAllPermissionableFields(conn: Connection): Promise<{field: string, editable: boolean}[]> {
    // 1. Discovery: List all CustomFields in the org
    // This bypasses current user permissions and finds everything Metadata-plane
    const listResult = await conn.metadata.list([{ type: 'CustomField' }], '61.0');
    if (!listResult || (Array.isArray(listResult) && listResult.length === 0)) return [];
    
    const allCustomFields = Array.isArray(listResult) ? listResult : [listResult];
    // Filter out Historical Data fields (__hd, __h) as they aren't deployable via PermSets and cause read errors
    const fullNames = allCustomFields
        .map(f => f.fullName)
        .filter(name => name.includes('__c') && !name.includes('__hd') && !name.includes('__h'));
    
    console.log(`Discovered ${fullNames.length} custom fields via listMetadata (filtered HD). Reading details...`);
    const results: {field: string, editable: boolean}[] = [];
    const batchSize = 10;
    
    for (let i = 0; i < fullNames.length; i += batchSize) {
        const batch = fullNames.slice(i, i + batchSize);
        try {
            const metadata = await conn.metadata.read('CustomField', batch);
            const metadataArray = Array.isArray(metadata) ? (metadata as any[]) : [metadata];
            
            for (let j = 0; j < metadataArray.length; j++) {
                const meta = metadataArray[j];
                const originalName = batch[j];
                
                if (!meta || !meta.fullName) {
                    continue;
                }

                // Skip required fields - they cannot be explicitly granted in a PermissionSet
                // Note: MasterDetail fields are implicitly required and must also be skipped.
                if (meta.required === true || meta.required === 'true' || meta.type === 'MasterDetail') {
                    continue;
                }
                
                const isReadOnly = !!(meta.formula || meta.type === 'Summary' || meta.calculated);
                results.push({
                    field: meta.fullName,
                    editable: !isReadOnly
                });
            }
        } catch (err: any) {
            console.error(`Error reading batch starting at ${i}:`, err.message);
        }
    }
    
    return results.sort((a, b) => (a.field || "").localeCompare(b.field || ""));
}
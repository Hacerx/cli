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
import { Connection } from "@jsforce/jsforce-node"
// @ts-ignore
import { getOrgsMap } from '@hacerx/sf-auth-decrypt';

type OrgData = {
    instanceApiVersion: string;
    /** 
     * OAuth access token used to authenticate API requests. 
     * @example "00D...!AQ0...abc"
     */
    accessToken: string;

    /**
     * Base URL of the Salesforce instance.
     * @example "https://inspiration-platform-3999-dev-ed.scratch.my.salesforce.com"
     */
    instanceUrl: string;

    /**
     * Unique Salesforce organization ID.
     * @example "00DS8000005ZQmLMAW"
     */
    orgId: string;

    /**
     * Salesforce username associated with this org.
     * @example "test-0i83vl4qqdzy@example.com"
     */
    username: string;

    /**
     * Login URL used for authentication.
     * @example "https://inspiration-platform-3999-dev-ed.scratch.my.salesforce.com"
     */
    loginUrl: string;

    /**
     * OAuth refresh token used to obtain new access tokens.
     * May be empty for short-lived scratch orgs.
     * @example "5Aep8613...xyz"
     */
    refreshToken: string;

    /**
     * Client ID used during OAuth flow (typically "PlatformCLI").
     * @example "PlatformCLI"
     */
    clientId: string;

    /**
     * Indicates whether this org is a Dev Hub org.
     * @example false
     */
    isDevHub: boolean;

    /**
     * Username of the Dev Hub associated with this org.
     * @example "jsolermart@alphacomponents.com"
     */
    devHubUsername: string;

    /**
     * Timestamp when the org was created, in milliseconds since epoch.
     * @example "1732401929000"
     */
    created: string;

    /**
     * Date when the org will expire, formatted as YYYY-MM-DD.
     * @example "2024-12-23"
     */
    expirationDate: string;

    /**
     * Identifier for the Salesforce instance where the org was created.
     * @example "SWE60S"
     */
    createdOrgInstance: string;

    /**
     * Indicates whether this is a scratch org.
     * @example true
     */
    isScratch: boolean;

    /**
     * Indicates whether this is a sandbox org.
     * @example false
     */
    isSandbox: boolean;

    /**
     * Whether the org is configured to track source changes (source tracking).
     * @example true
     */
    tracksSource: boolean;

    /**
     * URL used to track source changes (if applicable).
     * @example "https://inspiration-platform-3999-dev-ed.scratch.my.salesforce.com"
     */
    tracksSourceUrl: string;

    /**
     * API version used when metadata was last retrieved.
     * @example "11/23/2024, 11:45:45 PM"
     */
    instanceApiVersionLastRetrieved: string;
};

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
    const orgsMap: Record<string, OrgData> = await getOrgsMap();

    let org = orgsMap[username] ?? Object.values(orgsMap).find((org) => org.username === username);
    if (!org) {
        throw new Error(`Org with username "${username}" not found`);
    }

    const conn = new Connection({
        instanceUrl: org.instanceUrl,
        accessToken: org.accessToken,
        // refreshToken: org.refreshToken
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
        debugger
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
import { DescribeSObjectResult, Field } from '@jsforce/jsforce-node';
import { format } from '../files.js';
import { PicklistValueSchema, PicklistResult } from '../../types/salesforce.js';

/**
 * Generate typescript definition for a sObject
 *
 * @param sObjectDef - sObject definition from describeSObject
 * @returns typescript definition for the sObject
 */
export async function generateTypes(sObjectDef: DescribeSObjectResult): Promise<string> {
    const fields = sObjectDef.fields;
  
    const picklistTypes = getPicklistTypes(sObjectDef.name, fields);
  
    const relations = generateChildRelations(sObjectDef);
  
    let tsContent = `type ${sObjectDef.name} = {\n`;
    //     let tsContent = `
    //   import { SObject } from './BaseTypes';
    //   ${relations.imports}
    //   // picklist types
    // ${picklistTypes.typeDefs.join('\n')}
  
    //   export interface $ {sObjectDef.name
    // } extends SObject {
    // \n`;
  
    fields.forEach((field) => {
      let fieldType: string;
      const fieldName = field.name;
  
      if (field.type === 'picklist') {
        fieldType = picklistTypes.typeNames.get(field.name) as string;
      } else {
        fieldType = mapFieldType(field.type);
      }
      // const optional = field.nillable ? '?' : '';
      const readOnly = field.calculated || field.autoNumber ? 'readonly ' : '';
      tsContent += `${additionalFieldInfo(field)} \n`;
      tsContent += `${readOnly}${fieldName}?: ${fieldType}; \n`;
      if (field.relationshipName) {
        tsContent += `${additionalFieldInfo(field)} \n`;
        tsContent += `${field.relationshipName}?: Partial<${field.referenceTo?.join(' | ') ?? ''}>; \n`;
      }
    });
  
    tsContent += relations.childrenDef;
  
    // close object
    tsContent += '} \n';
  
    tsContent = `${picklistTypes.typeDefs.join('\n')}\n\n${await format(tsContent)}`;
  
    return tsContent.trim();
  }
  
  /**
   * Builds a typescript string literal union type for a picklist field based on it's picklist values
   * The union type only includes active picklist values and is sorted alphabetically
   *
   * @param field - The field metadata
   * @returns A string literal union type for the picklist field
   */
  function buildPicklist(field: Field): string {
    if (field.picklistValues) {
      const active = (field.picklistValues as PicklistValueSchema[])
        .filter((p) => p.active === true)
        .map((p) => `'${p.value}'`);
      return active.join(' | ');
    }
    return '';
  }
  
  /**
   * Builds typescript type definitions for all picklist fields of a given object
   *
   * The function takes an object name and an array of field metadata as input and
   * returns an object containing two properties: typeDefs and typeNames.
   * typeDefs is an array of string literal union types for each picklist field.
   * The string literal union type is sorted alphabetically and only contains active picklist values.
   * typeNames is a map where the keys are the names of the picklist fields and the values are the
   * corresponding type names.
   *
   * Note that the type names are generated as follows: <object name>_<field name>_Picklist
   *
   * @param objName - The name of the object
   * @param field - The field metadata of the object
   * @returns An object containing the picklist type definitions and type names
   */
  function getPicklistTypes(objName: string, field: Field[]): PicklistResult {
    const picklistTypes: PicklistResult = {
      typeDefs: [],
      typeNames: new Map(),
    };
  
    field
      .filter((f) => f.type === 'picklist')
      .forEach((f) => {
        const tName = `${objName}_${f.name}_Picklist`;
        const picklistType = `${buildPicklist(f)}${f.restrictedPicklist === true ? '' : ' | (string & {})'}`;
        picklistTypes.typeDefs.push(`type ${tName} = ${picklistType || "''"};`);
        picklistTypes.typeNames.set(f.name, tName);
      });
  
    return picklistTypes;
  }
  
  /**
   * Generates additional field information as a comment for the typescript definition of the field
   *
   * The function takes a Field object as input and returns a string containing a comment
   * that includes the following information about the field:
   *
   * - label
   * - type
   * - nillable
   * - createable
   * - updateable
   * - inlineHelpText (if available)
   * - calculatedFormula (if available)
   * - referenceTo (if available)
   * - relationshipName (if available)
   * - unique (if true)
   * - autoNumber (if true)
   *
   * The comment is formatted as a typescript docstring and is meant to be used in the
   * typescript definition of the field.
   *
   * @param field - The Field object to generate additional information about
   * @returns A string containing the additional field information as a comment
   */
  function additionalFieldInfo(field: Field): string {
    let moreInfo = '';
    const moreInfoPrefix = '\n* ';
    moreInfo += field.inlineHelpText ? `${moreInfoPrefix}@HelpText ${field.inlineHelpText}` : '';
    moreInfo += field.calculatedFormula ? `${moreInfoPrefix}@Formula - ${field.calculatedFormula}` : '';
    // moreInfo += field.calculated ? '\n    * @Formula' : '';
    moreInfo +=
      field.referenceTo && field.referenceTo.length > 0
        ? `${moreInfoPrefix}@RelatedTo - ${field.referenceTo?.join(',')}`
        : '';
    moreInfo += field.relationshipName ? `${moreInfoPrefix}@RelationshipName - ${field.relationshipName}` : '';
    moreInfo += field.unique ? `${moreInfoPrefix}@Unique` : '';
    moreInfo += field.autoNumber ? `${moreInfoPrefix}@Auto Number` : '';
  
    const cmt = `/**
       * @label ${field.label}
       * @type ${field.type}
       * @nillable ${field.nillable}
       * @Create ${field.createable}
       * @Update ${field.updateable}
       ${moreInfo.trim()} */`;
  
    return cmt;
  }
  
  /**
   * Generate typescript definition for child relationships
   *
   * @param object - The DescribeSObjectResult to generate child relationships for
   * @returns An object containing the typescript definition for the child relationships and any necessary imports
   * @example
   * {
   * childrenDef: '/* typescript definition for child relationships * /',
   * imports: '/* imports required for child relationships * /'
   * }
   */
  function generateChildRelations(object: DescribeSObjectResult): { childrenDef: string; imports: string } {
    let childrenDef = '\n// Child relationships\n';
    const imports = '';
    object.childRelationships?.forEach((child) => {
      if (child.relationshipName) {
        const childType = child.childSObject ?? 'SObject';
        // const childType = (config as any)?.sObjects?.includes(child.childSObject) ?
        // child.childSObject : 'SObject'
  
        // if (childType !== 'SObject' && childType !== object.name) {
        //   imports += `import { ${childType} } from './${childType}';\n`;
        // }
  
        childrenDef += `/** 
       * @Object - ${child.childSObject}
       * @Field - ${child.field}
       * @cascadeDelete - ${child.cascadeDelete}
       * @restrictedDelete - ${child.restrictedDelete}
       **/
      ${child.relationshipName}?: Partial<${childType}>[];\n`;
      }
    });
  
    return { childrenDef, imports };
  }
  
  /**
   * Maps a Salesforce field type to a TypeScript type
   *
   * @param salesforceType - The Salesforce field type to map
   * @returns The corresponding TypeScript type
   */
  export function mapFieldType(salesforceType: string): string {
    switch (salesforceType) {
      case 'picklist':
      case 'string':
      case 'textarea':
      case 'reference':
      case 'id':
        return 'string';
  
      // boolean
      case 'boolean':
        return 'boolean';
  
      // numbers
      case 'int':
      case 'currency':
      case 'percent':
      case 'number':
      case 'double':
        return 'number';
  
      // dates
      case 'date':
      case 'datetime':
        return 'Date | string';
  
      // other
      default:
        return 'any';
    }
  }
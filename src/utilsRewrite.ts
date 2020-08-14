import fs from 'fs';
import path from 'path';
import { IControllerBase } from 'controllerMethodDefinitions';

const IMPORTS = {
  dto: '@private-dto',
  http: '@angular/common/http',
}

class Imports {
  imports: Map<string, Set<string>> = new Map<string, Set<string>>();

  add(value: string, from: string) {
    let set = this.imports.get(from);
    if (!set) {
      set = new Set();
      this.imports.set(from, set);
    }
    set?.add(value);
  }

  get(): string[] {
    const multipleImports: string[] = []
    // const importsArray: string[] = [];
    for (const [from, values] of this.imports.entries()) {
      const valuesStr = Array.from(values).join(', ');
      multipleImports.push(`import {${valuesStr}} from ${from};`);
    }
    return multipleImports;
  }
}

class SetWrapper {
  set: Set<string> = new Set<string>();

  add(data: string) {
    this.set.add(data);
  }

  get(): string[] {
    return Array.from(this.set);
  }
}

function getJsonFile(filePath: string): any {
  const p = path.join(__dirname, filePath);
  const buffer = fs.readFileSync(p, 'utf8');
  return JSON.parse(buffer);
}

interface GType {
  pageable: boolean;
  type: string;
  ref: string;
  name: string;
  required: boolean;
  default: string | undefined;
  in: string;
}

function matchDto(data: any): GType {
  let dto = '';
  let pageable = false;

  const ref = data?.$ref;
  if (ref) {
    const matches = /^#\/definitions\/(.+)/.exec(ref);
    if (matches && matches[1]) {
      dto = matches[1];
      const pageMatches = /(Page|PaginationResponse)«(.+)»/.exec(dto);
      if (pageMatches) {
        dto = pageMatches[2];
        pageable = true;

        if (dto === undefined) {
          console.error('Could not convert PAGE');
        }
      }
    } else {
      console.error('could not parse dtos ref');
    }
  }

  return { pageable, type: dto, ref: ref as string };
}

function getProp(value: IControllerBase, imports: Imports): GType {
  // let gType: GType = { 
  //   pageable: false, 
  //   type: '', 
  //   ref: '',
    // name: value.name,
    // required: value?.required ? value.required : false,
    // default: value?.default ? value.default : undefined,
    // in: value.in,
  // };
  const type = '';

  if (value.type) {
    switch (value.type) {
      case TYPES.string:
      case TYPES.boolean:
        type = value.type;
        break;
      case TYPES.number:
      case TYPES.integer:
        type = TYPES.number;
        break;
      case TYPES.file:
        type = 'FormData';
        break;
      case TYPES.array:
        if (value.items) {
          type = `${getProp(value.items, imports).type}[]`;
        } else {
          throw 'Parsing array: error';
        }
        break;
      case TYPES.object: {
        // only schema can have additional properties
        const additionalProperties = value?.additionalProperties;

        if (additionalProperties) {
          gType.type = getProp(value.additionalProperties, imports).type;
        } else {
          gType.type = type;
          gType.type = 'any';
        }
        break;
      }
    }
  } else if (value?.schema) {
    gType.type = getProp(value.schema, imports).type;
  }

  if (gType.type !== '') {
    return gType;
  } else {
    gType = matchDto(value);

    if (gType.type === '') {
      console.error('this type does not exist');
      console.error(value);
    } else {
      imports.add(gType.type, '@private/repository')
    }
  }
  return gType;
}

const TYPES = {
  string: 'string',
  array: 'array',
  number: 'number',
  integer: 'integer',
  boolean: 'boolean',
  file: 'file',
  object: 'object',
}


export {
    Imports,
    IMPORTS,
    SetWrapper,
    getJsonFile,
    GType,
    matchDto,
    getProp,
    TYPES,
}
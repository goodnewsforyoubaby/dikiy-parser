import fs from 'fs';
import path from 'path';

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

function getType(value: any, imports: Imports): GType {
  let gType: GType = { pageable: false, type: '', ref: '' };
  const type = value?.type as string;
  if (type) {
    switch (type) {
      case TYPES.string:
      case TYPES.boolean:
        gType.type = type;
        break;
      case TYPES.number:
      case TYPES.integer:
        gType.type = TYPES.number;
        break;
      case TYPES.file:
        gType.type = 'FormData';
        break;
      case TYPES.array:
        gType.type = `${getType(value.items, imports).type}[]`;
        break;
      case TYPES.object: {
        const additionalProperties = value?.additionalProperties;

        if (additionalProperties) {
          gType.type = getType(value.additionalProperties, imports).type;
        } else {
          gType.type = type;
          gType.type = 'any';
        }
        break;
      }
    }
  } else if (value?.schema) {
    gType.type = getType(value.schema, imports).type;
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
    getType,
    TYPES,
}
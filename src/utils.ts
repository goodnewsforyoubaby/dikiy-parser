import fs, { existsSync, mkdirSync, writeFile } from 'fs';
import path from 'path';
import { IControllerBase, IControllerSchema } from 'ISwagger';
import { get } from 'http';
import prettier from 'prettier';
import parser from 'prettier/parser-typescript';

function prettify(code: string): string {
  return prettier.format(code, { parser: 'typescript'});
}

enum ImportFrom {
  dto ='@private-dto',
  http ='@angular/common/http',
  plugins = '@models/plugins',
  core = '@angular/core',
  rxjs = 'rxjs',
}

interface IArgument {
  name: string,
  type: string,
  default: string | undefined,
  required: boolean,
  in: string,
  str: string,
}

class Imports {
  imports: Map<ImportFrom, Set<string>> = new Map<ImportFrom, Set<string>>();

  add(importFrom: ImportFrom, value: string) {
    let set = this.imports.get(importFrom);
    if (!set) {
      set = new Set();
      this.imports.set(importFrom, set);
    }
    set?.add(value);
  }

  get(): string[] {
    const multipleImports: string[] = []
    // const importsArray: string[] = [];
    for (const [from, values] of this.imports.entries()) {
      const valuesStr = Array.from(values).join(', ');
      multipleImports.push(`import { ${valuesStr} } from '${from}';`);
    }
    return multipleImports;
  }
}

class SetWrapper<T> {
  set: Set<T> = new Set<T>();

  add(data: T) {
    this.set.add(data);
  }

  get(): T[] {
    return Array.from(this.set);
  }
}

function getJsonFile(filePath: string): any {
  const p = path.join(__dirname, filePath);
  const buffer = fs.readFileSync(p, 'utf8');
  return JSON.parse(buffer);
}

interface Dto {
  types: string[];
  pageable: boolean;
}

function getMatch(value: string, regExp: RegExp, index: number): string | null {
  const matches = regExp.exec(value);
  if (matches !== null && matches[index] !== null) {
    if (matches[index] !== null) {
      return matches[index];
    }
  }
  return null;
}

function getFirstMatch(value: string, regExp: RegExp): string | null {
  return getMatch(value, regExp, 1);
}

function extractDto(dto: string, dtos: string[]) {
  const firstDto = getFirstMatch(dto, /(.+)(«(.+)»)/);
  if (firstDto === null) {
    dtos.push(dto);
    return dtos;
  }

  dtos.push(firstDto);
  const secondDto = getMatch(dto, /(.+)«(.+)»$/, 2);
  secondDto !== null && extractDto(secondDto, dtos);
  return dtos;
}


function matchDto(ref: string): Dto {
  const dto = getFirstMatch(ref, /^#\/definitions\/(.+)/);
  if (dto === null) {
    throw 'Could not convert ref';
  }

  const pageableDto = getFirstMatch(dto, /(?:Page|PaginationResponse)«(.+)»/);
  if (pageableDto !== null) {
    return { pageable: true, types: extractDto(pageableDto, []) };
  }

  return { pageable: false, types: extractDto(dto, []) };
}

interface Prop {
  type: string,
  importType: string,
  control: PropControl,
}

interface PropControl {
  isDto: boolean;
  isPageable: boolean;
  isArray: boolean;
}

function getProp(value: IControllerBase, control: PropControl): Prop {
  let type = '';
  let importType = '';

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
          control.isArray = true;
          importType = getProp(value.items, control).type;
          type = `${importType}[]`
        } else {
          throw 'Parsing array: error';
        }
        break;
      case TYPES.object: {
        // only schema can have additional properties
        const additionalProperties = (value as IControllerSchema)?.additionalProperties;

        if (additionalProperties) {
          const prop = getProp(additionalProperties, control);
          type = `{ [k: string]: ${prop.type} }`;
          importType = prop.importType;
        } else {
          type = `{ [k: string]: any }`;
        }
        break;
      }
    }
  } else if (value?.schema) {
    const prop = getProp(value.schema, control);
    type = prop.type;
    importType = prop.importType;
    // type = getProp(value.schema, control).type;
    // importType = type;
  } else if (value?.$ref) {
    // consider taking this to the outside
    control.isDto = true;
    // work correctly around matchDto returning multiple dtos
    const dto = matchDto(value.$ref);

    if (dto.pageable) {
      control.isPageable = true;
    }

    if (dto.types.length === 1) {
      type = dto.types[0];
      importType = dto.types[0];
    } else {
      console.log(dto.types);
      type = 'dot';
      importType = 'dot';
    }
  }

  if (type === '') {
    throw `Cannot parse ${value.toString()}`
  }

  return { type, importType, control };
}

function createStringLiteralFromUrl(url: string): string {
  const something = url.split('{');
  for (let i = 1; i < something.length; i += 1) {
    something[i] = '${' + something[i];
  }
  return something.join('');
}

function saveFile(fileName: string, folder: string, data: string): void {
  // const fileName = `${kebabCase(dtoName)}.service.ts`;
  const path = `${__dirname}/${folder}/`;
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
  writeFile(`${path}/${fileName}`, data, err => {
    if (err) {
      throw new Error(err.message);
    }
  });
}

function createSwaggerRequest(swaggerURL: string): Promise<string> {
  return new Promise((resolve, reject) => {
    get(swaggerURL, res => {
      let data = '';
      res
        .on('data', chunk => (data += chunk))
        .on('end', () => resolve(JSON.stringify(data)))
        .on('error', reject);
    });
  });
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
  ImportFrom,
  SetWrapper,
  getJsonFile,
  matchDto,
  getProp,
  TYPES,
  getFirstMatch,
  PropControl,
  Prop,
  createStringLiteralFromUrl,
  IArgument,
  saveFile,
  createSwaggerRequest,
  prettify,
}
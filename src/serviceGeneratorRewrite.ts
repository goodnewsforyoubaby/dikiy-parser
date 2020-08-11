import fs from 'fs';
import path from 'path';
import { camelCase, upperFirst } from 'lodash';
import { request } from 'http';

function getJsonFile(filePath: string): any {
  const p = path.join(__dirname, filePath);
  const buffer = fs.readFileSync(p, 'utf8');
  return JSON.parse(buffer);
}

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

// top and bottom are going to be the same
// imports and exports
class GFile {
  name: string;

  exports: string[] = [];
  imports: Imports = new Imports();

  classes: GClass[] = [];

  parts: GPart[] = [];

  constructor(name: string) {
    this.name = name;
  }

  createClass(name: string): GClass {
    const gClass = new GClass(name, this.imports);
    this.classes.push(gClass);
    return gClass;
  }

  save(directory: string, extention: string) {
    const p = path.join(__dirname, directory);
    fs.writeFileSync(p, `${this.name}${extention}`);
  }
}

class GPart {
  stringRepresentation = '';
  imports: Imports;
  name: string;

  constructor(name: string, imports: Imports) {
    this.name = name;
    this.imports = imports;
  }

  getImports() {
    return this.imports;
  }

  toString() {
    return this.stringRepresentation;
  }
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

class Argument {
  name: string;
  gType: GType;
  required: boolean;
  default: string;
  in: string;

  constructor(value: any, imports: Imports) {
    this.name = value.name;
    this.gType = getType(value, imports);
    this.required = value.required;
    this.default = value?.default ? value.default : undefined;
    this.in = value.in;

  }

  toString(): string {
    if (this.required) {
      return `${this.name}: ${this.gType.type}`
    }
    return `${this.name}: ${this.gType.type}`
    // return `${this.name}: ${this.type} = ${this.default}`
  }
}

class GMethod extends GPart {
  arguments: Argument[] = [];
  returnValue = ''
  returnType = ''
  insideLines: string[] = [];

  httpOptions: string[] = [];
  queries: string[] = [];
  httpBody = '';

  constructor(name: string, imports: Imports) {
    super(name, imports);
  }

  static newService(data: any, imports: Imports): GMethod {
    const httpArguments = new SetWrapper();
    const queries = new SetWrapper();
    const gMethod = new GMethod(data.summary, imports);

    // get method arguments
    const parameters = data?.parameters ? (data.parameters as any[]) : [];
    if (parameters.length > 0) {
      parameters.forEach(parameter => {
        const arg = gMethod.addArgument(parameter);
        console.log(arg)
      })
    }

    // extract method name
    const matches = /(.+)Using.+$/.exec(data.operationId);
    if (matches && matches[1]) {
      gMethod.name = matches[1];
    } else {
      console.error('Could not find method name');
    }

    // get return type
    const schema = data.responses["200"]?.schema;
    if (schema) {
      const gType = getType(schema, gMethod.imports);
      if (gType.pageable) {
        gMethod.returnType = 'any';
      } else if (schema.format === 'byte') {
        gMethod.httpOptions.push(`responseType: 'blob'`);
        gMethod.httpOptions.push(`observe: 'response'`);
        gMethod.returnType = schema.type as string;
      } else {
        gMethod.returnType = gType.type;
      }
    } else {
      gMethod.returnType = 'void';
    }
    // console.log(gMethod.returnType);
    return gMethod;
  }

  addArgument(data: any) {
    const arg = new Argument(data, this.imports);
    let type = '';
    const gType = getType(data.schema, this.imports);

    if (arg.in === 'body') {
      // name = 'body';
      if (gType.pageable) {
        type = 'any';
        // type = `PageableRequestBody<${str}>`;
        // pushUniqueValue(this.pluginImports, 'PageableRequestBody');
      } else {
        type = gType.type;
      }
      // pushUniqueValue(httpArguments, name);
      // pushUniqueValue(this.pageableImports, type);
    } else if (arg.in === 'formData') {
      // pushUniqueValue(httpArguments, 'formData');
    } else if (arg.in === 'path') {
      // do nothing
    } else if (arg.in === 'query') {
      const camelcaseName = camelCase(name);
      // possibly need to add conversions for other types
      const querieArgument = type === 'boolean' ? `String(${camelcaseName})` : camelcaseName;
      this.queries.push(`.set('${name}', ${querieArgument})`);

      this.imports.add('HttpParams', IMPORTS.http);
    }
    this.arguments.push(arg);
    return arg;
  }

  toString(): string {
    return `
      ${this.name}(${this.arguments.join(', ')}): ${this.returnType} {
        ${this.insideLines.join(';\n')}
        return ${this.returnValue};
      }
    `
  }
}

class GClass extends GPart {
  methods: GMethod[] = [];
  // fields: GField[];

  constructor(name: string, imports: Imports) {
    super(name, imports)
  }

  addMethod(name: string) {
    const gMethod = new GMethod(name, this.imports);
    this.methods.push(gMethod);
    return gMethod;
  }

  addServiceMethod(data: any) {
    const gMethod = GMethod.newService(data, this.imports);
    this.methods.push(gMethod);
    return gMethod;
  }
}

function generateServices() {
  const controllerMap = new Map<string, GFile>()
  const controllers = getJsonFile('api-docs.json').paths as any;
  for (const [controllerName, controllerInside] of Object.entries<any>(controllers)) {
    for (const [requestType, requestInside] of Object.entries<any>(controllerInside)) {
      let file = controllerMap.get(controllerName);
      if (file === undefined) {
        const fileName = camelCase(requestInside.tags[0]);
        file = new GFile(fileName);
        controllerMap.set(controllerName, file);

        const className = upperFirst(fileName);
        file.createClass(className);
      }
      const gClass = file.classes[0];

      const gMethod = gClass.addServiceMethod(requestInside);
      // const parameters = (requestInside?.parameters as any[]);
      // if (parameters) {
      //   parameters.forEach(parameter => {
      //     console.log(parameter);
      //   })
      // }
    }
    // break;
  }
}

export { generateServices };
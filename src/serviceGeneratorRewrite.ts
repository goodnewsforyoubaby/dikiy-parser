import fs from 'fs';
import path from 'path';
import { camelCase, upperFirst } from 'lodash';
import { request } from 'http';
import { Imports, getType, GType, IMPORTS, SetWrapper } from 'utilsRewrite';

// top and bottom are going to be the same
// imports and exports
class GFile {
  name: string;

  exports: string[] = [];
  imports: Imports = new Imports();

  classes: GClass[] = [];

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
  imports: Imports;
  name: string;

  constructor(name: string, imports: Imports) {
    this.name = name;
    this.imports = imports;
  }
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
  httpBody = '';
  returnValue = ''
  returnType = ''
  insideLines: string[] = [];

  arguments = new SetWrapper();
  queries = new SetWrapper();
  httpOptions = new SetWrapper();

  constructor(name: string, imports: Imports) {
    super(name, imports);
  }

  static newService(data: any, imports: Imports): GMethod {
    const gMethod = new GMethod(data.summary, imports);

    // get method arguments
    const parameters = data?.parameters ? (data.parameters as any[]) : [];
    if (parameters.length > 0) {
      parameters.forEach(parameter => {
        const arg = gMethod.addArgument(parameter);
        console.log(arg.gType.type);
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

    if (arg.in === 'body') {
      // name = 'body';
      if (arg.gType.pageable) {
        arg.gType.type = 'any';
        // type = `PageableRequestBody<${str}>`;
        // pushUniqueValue(this.pluginImports, 'PageableRequestBody');
      }
      // pushUniqueValue(httpArguments, name);
      // pushUniqueValue(this.pageableImports, type);
    } else if (arg.in === 'formData') {
      // pushUniqueValue(httpArguments, 'formData');
    } else if (arg.in === 'path') {
      // do nothing
    } else if (arg.in === 'query') {
      const camelcaseName = camelCase(arg.name);
      // possibly need to add conversions for other types
      const querieArgument = arg.gType.type === 'boolean' ? `String(${camelcaseName})` : camelcaseName;
      this.queries.push(`.set('${arg.name}', ${querieArgument})`);

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

  constructor(name: string, imports: Imports) {
    super(name, imports)
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
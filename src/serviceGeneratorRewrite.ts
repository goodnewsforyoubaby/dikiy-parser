import fs from 'fs';
import path from 'path';
import { camelCase, upperFirst } from 'lodash';
import { request } from 'http';
import { Imports, getProp, GType, IMPORTS, SetWrapper } from 'utilsRewrite';
import { IControllerMethod } from 'controllerMethodDefinitions';

// top and bottom are going to be the same
// imports and exports
class GFile {
  name: string;

  exports: string[] = [];
  imports: Imports = new Imports();

  classes: GServiceClass[] = [];

  constructor(name: string) {
    this.name = name;
  }

  createServiceClass(name: string): GServiceClass {
    const gClass = new GServiceClass(name, this.imports);
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

class GServiceClass extends GPart {
  methods: GServiceMethod[] = [];

  constructor(name: string, imports: Imports) {
    super(name, imports)
  }

  addServiceMethod(data: IControllerMethod) {
    const gMethod = new GServiceMethod(data, this.imports);
    this.methods.push(gMethod);
    return gMethod;
  }
}


class GServiceMethod extends GPart {
  httpBody = '';
  returnValue = ''
  returnType = ''
  insideLines: string[] = [];

  arguments = new SetWrapper();
  queries = new SetWrapper();
  httpOptions = new SetWrapper();

  constructor(data: IControllerMethod, imports: Imports) {
    super(name, imports);

    // get method arguments
    // const parameters = data?.parameters ? (data.parameters as any[]) : [];
    const parameters = data.parameters;
    if (parameters.length > 0) {
      parameters.forEach(parameter => {
        const gType = getProp({ value: parameter, imports });
        this.createArgument(gType);
      })
    }

    // extract method name
    const matches = /(.+)Using.+$/.exec(data.operationId);
    if (matches && matches[1]) {
      this.name = matches[1];
    } else {
      console.error('Could not find method name');
    }

    // get return type
    const schema = data.responses["200"]?.schema;
    if (schema) {
      const gType = getProp({ value: schema, imports: this.imports });
      if (gType.pageable) {
        this.returnType = 'any';
      } else if (schema.format === 'byte') {
        this.httpOptions.add(`responseType: 'blob'`);
        this.httpOptions.add(`observe: 'response'`);
        this.returnType = schema.type as string;
      } else {
        this.returnType = gType.type;
      }
    } else {
      this.returnType = 'void';
    }
  }

  createArgument(gType: GType) {
    if (gType.in === 'body') {
      // name = 'body';
      if (gType.pageable) {
        gType.type = 'any';
        // type = `PageableRequestBody<${str}>`;
        // pushUniqueValue(this.pluginImports, 'PageableRequestBody');
      }
      // pushUniqueValue(httpArguments, name);
      // pushUniqueValue(this.pageableImports, type);
      this.httpBody = gType.name;
    } else if (gType.in === 'formData') {
      this.httpBody = gType.name;
    } else if (gType.in === 'path') {
      // do nothing
    } else if (gType.in === 'query') {
      const camelcaseName = camelCase(gType.name);
      // possibly need to add conversions for other types
      const querieArgument = gType.type === 'boolean' ? `String(${camelcaseName})` : camelcaseName;
      this.queries.add(`.set('${gType.name}', ${querieArgument})`);

      this.imports.add('HttpParams', IMPORTS.http);
    }
    const argumentStr = `${gType.name}: ${gType.type}`;
    this.arguments.add(argumentStr);
    return argumentStr;
  }

  toString(): string {
    return `
      ${this.name}(${this.arguments.get().join(', ')}): ${this.returnType} {
        ${this.insideLines.join(';\n')}
        return ${this.returnValue};
      }
    `
  }
}


function generateServices() {
  const controllerMap = new Map<string, GFile>()
  const controllers = getJsonFile('api-docs.json').paths as any;
  for (const [controllerName, controllerInside] of Object.entries<any>(controllers)) {
    for (const [requestType, requestInside] of Object.entries<IControllerMethod>(controllerInside)) {
      let file = controllerMap.get(controllerName);
      if (file === undefined) {
        const fileName = camelCase(requestInside.tags[0]);
        file = new GFile(fileName);
        controllerMap.set(controllerName, file);

        const className = upperFirst(fileName);
        file.createServiceClass(className);
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
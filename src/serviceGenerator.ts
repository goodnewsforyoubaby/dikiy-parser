import path from 'path';
import { camelCase, upperFirst } from 'lodash';
import {
  createStringLiteralFromUrl, generateJsdocComment,
  getFirstMatch,
  getPropertyWithMeta,
  IArgument,
  ImportFrom,
  Imports,
  prettify,
  Prop,
  saveFile,
  SetWrapper,
} from './utils';
import { ControllerMethod, ControllerParameter, ControllerSchema } from './Swagger';

// implement HEADER
class GPart {
  imports: Imports;
  name: string;

  constructor(name: string, imports: Imports) {
    this.name = name;
    this.imports = imports;
  }
}

class GFile {
  name: string;

  exports: string[] = [];
  imports: Imports = new Imports();

  classes: GServiceClass[] = [];

  constructor(name: string) {
    this.name = name
      .split('-')
      .slice(0, -1)
      .join('-');
  }

  createServiceClass(name: string): GServiceClass {
    const gClass = new GServiceClass(name, this.imports);
    this.classes.push(gClass);
    return gClass;
  }

  toString() {
    const importsStr = this.imports.get().join('\n');
    const classesStr = this.classes.join('\n');

    return `
      ${importsStr}
      ${classesStr}
    `
  }
  save(directory: string, extension: string) {
    saveFile(`${this.name}${extension}`, directory, prettify(this.toString()));
  }
}

class GServiceClass extends GPart {
  methods: GServiceMethod[] = [];
  services: string[] = [];

  constructor(name: string, imports: Imports) {
    super(name, imports)
    this.name = name
      .split('-')
      .slice(0, -1)
      .map(word => upperFirst(word))
      .join('') + 'Service';

    this.services.push('private http: HttpClient');

    this.imports.add(ImportFrom.core, 'Injectable');
    this.imports.add(ImportFrom.rxjs, 'Observable');
    this.imports.add(ImportFrom.http, 'HttpClient')
  }

  addServiceMethod(requestType: string, requestUrl: string, data: ControllerMethod) {
    const gMethod = new GServiceMethod(requestType, requestUrl, data, this.imports);
    this.methods.push(gMethod);
    return gMethod;
  }

  toString() {
    const servicesStr = this.services.join(', ');
    const methodsStr = this.methods.join('\n');

    return `
      @Injectable({
        providedIn: 'root',
      })
      export class ${this.name} {
        constructor(${servicesStr}) {}
        ${methodsStr}
      }
    `
   }
}

class GServiceMethod extends GPart {
  httpBody = '';
  returnValue = ''
  returnType = ''
  insideLines: string[] = [];

  arguments: IArgument[] = [];
  queries = new SetWrapper();
  headers = new SetWrapper();
  httpOptions: string[] = [];

  requestType: string;
  requestUrl: string;

  comment = '';

  constructor(requestType: string, requestUrl: string, data: ControllerMethod, imports: Imports) {
    super(data.summary, imports);
    if (data.summary && /[а-яА-ЯЁё]/.test(data.summary)) {
      this.comment = generateJsdocComment(data.summary);
    }
    this.requestType = requestType;
    this.requestUrl = requestUrl;

    // get method arguments
    this.arguments = this.getArguments(data);

    this.httpBody = this.getBody();

    // extract method name
    this.name = this.getMethodName(data.operationId);

    // get return type
    const schema = data.responses["200"]?.schema;
    this.returnType = this.createReturnType(schema)

  }

  toString() {
    const argumentsStr = this.arguments.map(arg => arg.str).join(', ');

    this.insideLines.push(`const url = \`${createStringLiteralFromUrl(this.requestUrl)}\``);

    if (this.queries.get().length > 0) {
      this.httpOptions.push('params');
      this.insideLines.push(`const params = new HttpParams()${this.queries.get().join('')}`);
    }

    if (this.headers.get().length > 0) {
      this.httpOptions.push('headers');
      this.insideLines.push(`const headers = new HttpHeaders()${this.headers.get().join('')}`);
    }

    const optionsStr = this.httpOptions.length > 0 ? `, { ${this.httpOptions.join(', ')} }` : '';
    const httpBodyStr = this.httpBody !== '' ? `, ${this.httpBody}` : '';
    this.insideLines.push(`return this.http.${this.requestType}<${this.returnType}>(url${httpBodyStr}${optionsStr})`);

    const insideLinesStr = this.insideLines.join('\n');
    const commentary = this.name;

    return `
      ${this.comment}
      ${this.name}(${argumentsStr}): Observable<${this.returnType}> {
        ${insideLinesStr}}
      `;
  }

  getBody() {
    if (this.requestType === 'post' || this.requestType === 'put') {
      if (this.httpBody === '') {
        return 'undefined';
      }
    }
    return this.httpBody;
  }

  getArguments(data: ControllerMethod) {
    // there can be multiple formData arguments
    // to prevent duplication of formData
    let formDataExists = false;
    let formDataOptionalExists = false;

    const parameters = data.parameters;
    let args: IArgument[] = [];
    if (parameters && parameters.length > 0) {
      parameters.forEach(parameter => {
        const prop = getPropertyWithMeta(parameter);

        if (parameter.in === 'formData') {
          if (parameter.required) {
            formDataExists = true;
          } else if (!parameter.required) {
            formDataOptionalExists = true;
          }
        }
        args.push(this.createArgument(parameter, prop));
      })
    }

    if (formDataExists && formDataOptionalExists) {
      args = args.filter(arg => {
        if (arg.in === 'formData' && !arg.required) {
          return false;
        }
        return true;
      })
    }
    return args;
  }

  getMethodName(unparsedName: string) {
    const name = getFirstMatch(unparsedName, /(.+)Using.+$/);
    if (name) {
      return name;
    } else {
      throw 'Could not find method name';
    }
  }

  createReturnType(schema: ControllerSchema | undefined): string {
    if (schema) {
      const prop = getPropertyWithMeta(schema);
      if (prop.control.isDto) {
        this.imports.add(ImportFrom.dto, prop.importType);
        if (prop.control.isPageable) {
          // this.returnType = 'any';
          // returnType = `PageableResponseBody<${prop.type}>`
          this.imports.add(ImportFrom.plugins, 'PageableResponseBody');
          return `PageableResponseBody<${prop.importType}>`
        }
      } else if (schema.format === 'byte') {
        this.httpOptions.push(`responseType: 'blob'`);
        this.httpOptions.push(`observe: 'response'`);
        if (schema.type) {
          return schema.type;
        } else {
          throw 'Cannot parse file return type'
        }
      }
      return prop.type;
    }

    return 'void';
  }

  createArgument(parameter: ControllerParameter, control: Prop): IArgument {
    // for names like 'X-User-Uuid', they are not valid in js
    const camelcaseName = camelCase(parameter.name);

    if (control.control.isDto) {
      this.imports.add(ImportFrom.dto, control.importType);
    }
    // when in body, always receive dto
    if (parameter.in === 'body') {
      this.httpBody = parameter.name;

      if (control.control.isPageable) {
        this.imports.add(ImportFrom.plugins, 'PageableRequestBody');
        control.type = `PageableRequestBody<${control.type}>`;
      }
    } else if (parameter.in === 'formData') {
      this.httpBody = parameter.name;
    } else if (parameter.in === 'path') {
      // do nothing
    } else if (parameter.in === 'query') {
      // possibly need to add conversions for other types
      const queryArgument = parameter.type === 'boolean' ? `String(${camelcaseName})` : camelcaseName;
      this.queries.add(`.set('${parameter.name}', ${queryArgument})`);

      this.imports.add(ImportFrom.http, 'HttpParams');
    } else if (parameter.in === 'header') {
      this.headers.add(`.set('${parameter.name}', ${camelcaseName})`);
      this.imports.add(ImportFrom.http, 'HttpHeaders');
    }
    parameter.name = camelcaseName;
    // add required or default cases
    const arg: IArgument = {
      name: parameter.name,
      type: control.type,
      default: parameter.default,
      required: parameter.required,
      in: parameter.in,
      str: '',
    }

    if (arg.default !== undefined) {
      arg.str = `${arg.name}: ${arg.type} = ${arg.default}`;
    } else {
      arg.str = `${arg.name}${arg.required ? '' : '?'}: ${arg.type}`;
    }
    return arg;
  }
}

function generateServices(data: any) {
  const controllerMap = new Map<string, GFile>();
  for (const [url, controllerInside] of Object.entries<any>(data.paths)) {
    for (const [requestType, requestInside] of Object.entries<ControllerMethod>(controllerInside)) {
      const name = requestInside.tags[0];
      let file = controllerMap.get(name);
      if (file === undefined) {
        file = new GFile(name);
        controllerMap.set(name, file);

        const className = upperFirst(name);
        file.createServiceClass(className);
      }
      const gClass = file.classes[0];

      const gMethod = gClass.addServiceMethod(requestType, url, requestInside);
    }
  }

  for (const [name, file] of controllerMap.entries()) {
    file.save('services', '.service.ts');
  }
}

export { generateServices };

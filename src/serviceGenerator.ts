import { loadJsonFile, pushUniqueValue, filterArrayForUniqueValues, createProp, saveFile } from "./utils";
import { camelCase } from "lodash";

interface Argument {
  str: string,
  required: boolean;
  name: string;
  type: string;
  in: string;
}

class Service {
  name: string;
  controllerName: string;
  deps: string[] = [];
  dtoImports: string[] = [];
  pluginImports: string[] = [];
  httpImports: string[] = ['HttpClient'];
  services: string[] = ['private http: HttpClient'];
  methods: string[] = [];
  str: string;
  // inject fileDownloader as service:
  //   private fileDownloader: FileDownloaderService
  // instead of http request, use:
  //   this.fileDownloader.download(url);

  constructor(controllerName: string) {
    this.controllerName = controllerName
      .split('-')
      .slice(0, -1)
      .join('-');

    this.name = controllerName
      .split('-')
      .slice(0, -1)
      .map(word => word[0].toUpperCase() + word.slice(1, word.length))
      .join('') + 'Service';
    this.str = '';
  }

  createTemplate(): string {
    const imports = [
      this.createImportStr('@private-dto', this.dtoImports),
      this.createImportStr('@models/plugins', this.pluginImports),
      this.createImportStr('@angular/common/http', this.httpImports),
    ];

    const servicesStr = this.services.join(', ');
    const methodsStr = this.methods.join('\n');
    const importsStr = imports.filter(i => i !== '').join('\n');

    this.str = `import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
${importsStr}

@Injectable({
  providedIn: 'root',
})
export class ${this.name} {
  constructor(${servicesStr}) {}
  \n${methodsStr}
}
`
    return this.str;
  }

  createImportStr(from: string, arr: string[]): string {
    return arr.length > 0 ? `import { ${arr.join(', ')} } from '${from}';` : '';
  }

  addMethod(url: string, requestMethod: string, methodInfo: any) {
    const queries: string[] = [];
    const httpArguments: string[] = [];
    let methodArguments: Argument[] = [];
    const options: string[] = [];

    let formDataExists = false;
    let formDataOptionalExists = false;
    
    if (methodInfo?.parameters) {
      for (const parameter of methodInfo.parameters) {
        const argument = this.addArgument(parameter, httpArguments, queries);
        if (argument.in === 'formData') {
          if (argument.required) {
            formDataExists = true;
          } else if (!argument.required) {
            formDataOptionalExists = true;
          }
        }

        methodArguments.push(argument);
        // inject fileDownloader as service:
        //   private fileDownloader: FileDownloaderService
        // instead of http request, use:
        //   return this.fileDownloader.download(url);
      }
    }

    // method arguments: get rid of formdata duplication
    if (formDataExists && formDataOptionalExists) {
      methodArguments = methodArguments.filter(methodArg => {
        if (methodArg.in === 'formData' && methodArg.required === false) {
          return false;
        }
        return true;
      })
    }

    // sort arguments, in case some of them have default parameter
    methodArguments.sort((a, b) => {
      const aNum = a.required ? 1 : 0;
      const bNum = b.required ? 1 : 0;
      return bNum - aNum;
    })

    // extract method name
    const matches = /^(.+)Using.{2,10}$/.exec(methodInfo.operationId as string);
    let name = '';
    if (matches) {
      name = matches[1];
    } else {
      console.error(`Operation Id does not match regex: ${matches}`);
    }

    // determine return type
    let returnType = '';
    const schema = methodInfo.responses["200"]?.schema;
    if (schema) {
      const { str, pageable } = createProp(schema, this.deps, this.dtoImports);
      returnType = str;

      if (pageable) {
        returnType = 'any';
        // returnType = `PageableResponseBody<${str}>`
        // pushUniqueValue(this.pluginImports, 'PageableResponseBody');
      } else if (schema.format === 'byte') {
        options.push(`responseType: 'blob'`);
        options.push(`observe: 'response'`);
        returnType = schema.type;
      }
              // this.imports.push(returnType);
    } else {
      returnType = 'void';
    }


    let httpBodyStr = httpArguments.length > 0 ? `, ${httpArguments.join(', ')}` : '';
    if (requestMethod === 'post' || requestMethod === 'put') {
      if (httpArguments.length === 0) {
         httpBodyStr = ', undefined';
      }
    }

    const argumentsStr =  filterArrayForUniqueValues(methodArguments.map(arg => arg.str)).join(', ');

    const insideMethodUnfiltered: string[] = [];

    if (queries.length > 0) {
      options.push('params');
      insideMethodUnfiltered.push(`const params = new HttpParams()${queries.join('')};`);
    }

    const optionsStr = options.length > 0 ? `, { ${options.join(', ')} }` : '';

    insideMethodUnfiltered.push(`const url = \`${this.createStringLiteralFromUrl(url)}\``);
    insideMethodUnfiltered.push(`return this.http.${requestMethod}<${returnType}>(url${httpBodyStr}${optionsStr})`);

    const insideMethod = insideMethodUnfiltered
      .map(str => `    ${str}`)
      .join('\n');

    const method = 
      `  ${name}(${argumentsStr}): Observable<${returnType}> {
${insideMethod}
  }
    `;
    // console.log(this.str);
    this.methods.push(method)
  }

  createStringLiteralFromUrl(url: string): string {
    const something = url.split('{');
    for (let i = 1; i < something.length; i += 1) {
      something[i] = '${' + something[i];
    }
    return something.join('');
  }

  addArgument(parameter: any, httpArguments: string[], queries: string[]): Argument {
    let name = parameter.name as string;
    let type = parameter.type as string;
    const inArgument = parameter.in as string;

    const required = parameter.required as boolean;
    const schema = parameter.schema;

    let str = '';

    if (inArgument === 'body') {
      const { str, pageable }  = createProp(schema, this.deps, this.dtoImports);
      // name = 'body';
      if (pageable) {
        type = 'any';
        // type = `PageableRequestBody<${str}>`;
        // pushUniqueValue(this.pluginImports, 'PageableRequestBody');
      } else {
        type = str;
      }

      pushUniqueValue(httpArguments, name);
      // pushUniqueValue(this.pageableImports, type);
    } else if (inArgument === 'path') {
      type = createProp(parameter, this.deps, this.dtoImports).str;
    } else if (inArgument === 'formData') {
      name = 'formData';
      type = 'FormData';
      pushUniqueValue(httpArguments, 'formData');
    } else if (inArgument === 'query') {
      type = createProp(parameter, this.deps, this.dtoImports).str;

      const camelcaseName = camelCase(name);
      // possibly need to add conversions for other types
      const querieArgument = type === 'boolean' ? `String(${camelcaseName})` : camelcaseName;
      queries.push(`.set('${name}', ${querieArgument})`);
      pushUniqueValue(this.httpImports, 'HttpParams');
    }

     name = camelCase(name);

    if (parameter?.default !== undefined) {
      str = `${name}: ${type} = ${parameter.default}`;
    } else {
      str = `${name}${required ? '' : '?'}: ${type}`;
    }

    return { str, required, name, type, in: inArgument };
  }
}

function generateSevices(jsonPaths: any): Map<string, Service> {
  // first we need to order paths by their tag
  // would be enough to have map of tags with their
  const tagsMap = new Map<string, Service>()
  for (const [url, info] of Object.entries<any>(jsonPaths)) {
    for (const [methodName, methodInfo] of Object.entries<any>(info)) {
      const controller = methodInfo.tags[0] as string;

      let service = tagsMap.get(controller);

      if (!service) {
        service = new Service(controller);
        tagsMap.set(controller, service);
      }
      service.addMethod(url, methodName, methodInfo);
    }
  }

  return tagsMap;
}

function parseAllFiles() {
  const { paths }  = loadJsonFile('/api-docs.json');

  const tagsMap = generateSevices(paths);

  for (const [tag, service] of tagsMap.entries()) {
      const template = service.createTemplate();
      saveFile(`${service.controllerName}.service.ts`, 'services', template);
  }
}

export { parseAllFiles };

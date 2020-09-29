import { writeFile, readdir } from 'fs';
import { kebabCase } from 'lodash';
import { generateJsdocComment, prettify, saveFile, TYPES } from './utils';
import { IInterfaceBody, IInterfaceParameter, ISwagger } from './ISwagger';


export class DikiyParser {
  generateDtos(data: ISwagger) {
    const { definitions } = data;
    for (const def of Object.values(definitions)) {
      // in case of inheritance
      let definitionBody = def;
      if (def?.allOf) {
        definitionBody = def.allOf[1];
      }

      const fileName = this.matchDtoName(definitionBody.title);
      if (fileName !== null) {
        const interfaceString = this.createFileData(definitionBody);
        saveFile(`${kebabCase(fileName)}.d.ts`, 'models', prettify(interfaceString));
      }
    }
    this.createIndexFile();
  }

  private createFileData(def: IInterfaceBody) {
    if (def.properties === undefined) {
      return `export type ${def.title} = any`;
    }
    const deps: string[] = [];
    const imports: string[] = [];
    const dtoName = this.matchDtoName(def.title);
    if (dtoName === null) {
      throw new Error('Could not parse DTO');
    }

    let data = '';

    const interfaceDescription = def?.description;
    if (interfaceDescription) {
      data += `${generateJsdocComment(interfaceDescription)}\n`;
    }

    data += `export interface ${dtoName}  {\n`;
    Object.entries(def.properties).forEach(([propName, propValue]) => {
      const propType = this.createProp(propValue, deps, imports, dtoName);

      // for comments
      const propDescription = propValue?.description;
      if (propDescription) {
        data += `${generateJsdocComment(propDescription)}\n`;
      }
      // for optional parameter
      let optionalPropStr = '';
      if (propValue?.required != null) {
        optionalPropStr = propValue.required ? '' : '?';
      } else if (propValue?.allowEmptyValue != null) {
        optionalPropStr = propValue.allowEmptyValue ? '?' : '';
      }
      data += `  ${propName}${optionalPropStr}: ${propType}`;
      data += '\n';
    });
    imports.forEach(i => (data = `${i}${data}`));
    return data + '}';
  }

  private createProp(propValue: IInterfaceParameter, deps: string[], imports: string[], interfaceName: string, ending = ';') {
    let prop = '';
    const { type } = propValue;
    if (type == TYPES.string) {
      // for enum
      // if (propValue?.enum) {
      //   const enums = propValue.enum.map(e => `'${e}'`).join(' | ');
      //   prop += `(${enums})`
      // } else {
      //   prop += `${TYPES.string}`;
      // }
      prop += `${TYPES.string}`;
    } else if (type === TYPES.integer || type === TYPES.number) {
      prop += `${TYPES.number}`;
    } else if (type === TYPES.boolean) {
      prop += `${TYPES.boolean}`;
    } else if (type === TYPES.object) {
      if (propValue.additionalProperties) {
        prop += `{ [k: string]: ${this.createProp(propValue.additionalProperties, deps, imports, interfaceName)} }`;
      } else {
        prop += `{ [k: string]: any }`;
      }
    } else if (type == TYPES.array) {
      prop += `${this.createProp(propValue.items, deps, imports, interfaceName, '[]')}`;
    } else if (type === undefined && typeof propValue.$ref === 'string') {
      const depDtoName = this.matchDtoName(propValue.$ref);
      if (depDtoName !== null) {
        if (!deps.includes(propValue.$ref)) {
          if (depDtoName !== interfaceName) {
            imports.push(`import { ${depDtoName} } from "./${kebabCase(depDtoName)}";\n`);
          }
          deps.push(propValue.$ref);
        }
        prop += `${depDtoName}`;
      } else {
        throw new Error('Could not parse Dto');
      }
    } else {
      throw new Error('Ошибка парсинга');
    }
    return prop + ending;
  }

  private matchDtoName(definition: string) {
    // const matches = /[^?#/definitions/](.*)/.exec(definition);
    const matches = /[^?#/definitions/](\w+)/.exec(definition);
    if (matches !== null) {

      const match = matches[0].trim();
      // const notAcceptable = ['Page', 'Map', 'PaginationResponse']
      // notAcceptable.forEach(v => {
      //   if (new RegExp(`${v}«.*»`).exec(match)) {
      //     console.log(`Found unacceptable DTO: ${match}`);
      //     return null;
      //   }
      // })
      return match;
    } else {
      console.error('Ошибка в партсинге #/definitions', definition);
      return null;
    }
  }

  private createIndexFile() {
    const path = `${__dirname}/models/`;
    readdir(path, (err, files) => {
      if (err) {
        throw new Error(err.message);
      }
      let data = '';
      files.forEach(file => (data += `export * from "./${file.replace('/^M//g', '').replace('.d.ts', '')}"\n`));
      writeFile(`${path}/index.d.ts`, prettify(data), err => {
        if (err) {
          throw new Error(err.message);
        }
      });
    });
  }
}


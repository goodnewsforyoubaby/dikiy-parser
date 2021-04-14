import { writeFile, readdir } from 'fs';
import { kebabCase } from 'lodash';
import { generateJsdocComment, prettify, saveFile, TYPES } from './utils';
import { SwaggerDefinition, SwaggerDefinitionProperty, Swagger } from './Swagger';

export interface DtoParserSettings {
  detailedEnum: boolean,
  enableComments: boolean,
}

export class DikiyParser {
  settings: DtoParserSettings;

  constructor(settings: DtoParserSettings = { detailedEnum: false, enableComments: true }) {
    this.settings = settings;
  }

  getDefinition(definition: SwaggerDefinition): SwaggerDefinition {
    if (definition?.allOf) {
      return definition.allOf[1];
    }
    return definition;
  }

  generateDtos(data: Swagger): void {
    const { definitions } = data;
    for (const def of Object.values(definitions)) {
      const definition = this.getDefinition(def);

      try {
        const fileName = this.matchDtoName(definition.title);
        const interfaceString = this.createFileData(definition);
        saveFile(`${kebabCase(fileName)}.d.ts`, 'models', prettify(interfaceString));
      } catch (e) {
        console.log((e as Error).message);
      }
    }
    this.createIndexFile();
  }

  createComment(comment: string | undefined): string {
    if (comment && this.settings.enableComments) {
      return `${generateJsdocComment(comment)}\n`;
    }
    return '';
  }

  isPropertyOptional(prop: SwaggerDefinitionProperty): boolean {
    if (prop?.required != null) {
      return !prop.required;
    } else if (prop?.allowEmptyValue != null) {
      return prop.allowEmptyValue;
    }
    return false;
  }

  private createFileData(def: SwaggerDefinition): string {
    if (def.properties === undefined) {
      return `export type ${def.title} = any`;
    }
    const dtoName = this.matchDtoName(def.title);

    let data = '';
    data += this.createComment(def?.description);

    const dependencies = new Set<string>();
    data += this.createInterface(def, dtoName, dependencies);
    data = this.getImports(dependencies, dtoName) + data;

    return data;
  }

  createInterface(definition: SwaggerDefinition, interfaceName: string, dependencies: Set<string>) {
    let interfaceStr = '';
    if (definition.properties === undefined) {
      return '';
    }

    interfaceStr += `export interface ${interfaceName}  {\n`;
    Object.entries(definition.properties).forEach(([propName, propValue]) => {
      interfaceStr += this.createComment(propValue?.description);

      const propType = this.createProp(propValue, dependencies);
      const optionalPropStr = this.isPropertyOptional(propValue) ? '?' : '';
      interfaceStr += `${propName}${optionalPropStr}: ${propType}\n`;
    });
    interfaceStr += '}';
    return interfaceStr;
  }

  getImports(dtoDependencies: Set<string>, interfaceName: string): string {
    let imports = '';
    dtoDependencies.forEach(dep => {
      if (dep !== interfaceName) {
        imports += `import { ${dep} } from "./${kebabCase(dep)}";\n`;
      }
    })
    return imports;
  }

  createEnum(definition: SwaggerDefinitionProperty): string {
    if (definition?.enum && this.settings.detailedEnum) {
      const enums = definition.enum.map(e => `'${e}'`).join(' | ');
      return `(${enums})`
    } else {
      return `${TYPES.string}`;
    }
  }

  private createProp(propValue: SwaggerDefinitionProperty, dependencies: Set<string>, ending = ';'): string {
    let prop = '';
    const { type } = propValue;
    if (type == TYPES.string) {
      prop += this.createEnum(propValue);
    } else if (type === TYPES.integer || type === TYPES.number) {
      prop += `${TYPES.number}`;
    } else if (type === TYPES.boolean) {
      prop += `${TYPES.boolean}`;
    } else if (type === TYPES.object) {
      if (propValue.additionalProperties) {
        const objectProp = this.createProp(propValue.additionalProperties, dependencies);
        prop += `{ [k: string]: ${objectProp} }`;
      } else {
        prop += `{ [k: string]: any }`;
      }
    } else if (type == TYPES.array) {
      prop += this.createProp(propValue.items, dependencies, '[]');
    } else if (type === undefined && typeof propValue.$ref === 'string') {
      const depDtoName = this.matchDtoName(propValue.$ref);
      dependencies.add(depDtoName);
      prop += `${depDtoName}`;
    } else {
      throw new Error('Ошибка парсинга');
    }
    return prop + ending;
  }

  private matchDtoName(definition: string): string {
    const matches = /[^?#/definitions/](.*)/.exec(definition);
    if (matches !== null) {
      const match = matches[0].trim();
      if (/.*«.*»/.exec(match)) {
        throw new Error(`Found unacceptable DTO: ${match}`);
      }
      return match;
    } else {
      throw new Error(`Ошибка в партсинге #/definitions: ${definition}`);
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


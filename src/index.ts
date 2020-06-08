import { get } from 'http';
import { mkdirSync, existsSync, writeFile, readdir } from 'fs';
const kebabCase = require('lodash.kebabcase');

const TYPES = {
  string: 'string',
  integer: 'integer',
  number: 'number',
  boolean: 'boolean',
  array: 'array',
  object: 'object',
};

const DEFAULTS = {
  swaggerURL: 'http://localhost:8080/v2/api-docs',
};

export class DikiyParser {
  async init() {
    const swaggerResponse = await this.createSwaggerRequest();
    const { definitions } = JSON.parse(JSON.parse(String(swaggerResponse)));
    for (const def of Object.values<any>(definitions)) {
      const fileName = def.title;
      const fileData = this.createFileData(def);
      this.saveFile(fileName, fileData);
    }
    this.createIndexFile();
  }

  private createSwaggerRequest(): Promise<string> {
    return new Promise((resolve, reject) => {
      get(DEFAULTS.swaggerURL, res => {
        let data = '';
        res
          .on('data', chunk => (data += chunk))
          .on('end', () => resolve(JSON.stringify(data)))
          .on('error', reject);
      });
    });
  }

  private createFileData(def: { [k: string]: any }) {
    if (def.properties === undefined) {
      return '';
    }
    const deps: string[] = [];
    const imports: string[] = [];
    const dtoName = this.matchDtoName(def.title);
    let data = `export interface ${dtoName}  {\r\n`;
    Object.entries<any>(def.properties).forEach(([propName, propValue]) => {
      data += `  ${propName}: ${this.createProp(propValue, deps, imports)}`;
      data += '\r\n';
    });
    imports.forEach(i => (data = `${i}${data}`));
    return data + '}';
  }

  private createProp(propValue: { [k: string]: any }, deps: string[], imports: string[]) {
    let prop = '';
    const { type } = propValue;
    if (type == TYPES.string) {
      prop += `${TYPES.string};`;
    } else if (type === TYPES.integer || type === TYPES.number) {
      prop += `${TYPES.number};`;
    } else if (type === TYPES.boolean) {
      prop += `${TYPES.boolean};`;
    } else if (type === TYPES.object) {
      if (propValue.additionalProperties) {
        prop += `{ [k: string]: ${this.createProp(propValue.additionalProperties, deps, imports)} };`;
      }
    } else if (type == TYPES.array) {
      prop += `${this.createProp(propValue.items, deps, imports)}[];`;
    } else if (type === undefined && typeof propValue.$ref === 'string') {
      const depDtoName = this.matchDtoName(propValue.$ref);
      if (!deps.includes(propValue.$ref)) {
        imports.push(`import { ${depDtoName} } from "./${kebabCase(depDtoName)}";\r\n`);
        deps.push(propValue.$ref);
      }
      prop += `${depDtoName}`;
    } else {
      throw new Error('Ошибка парсинга');
    }
    return prop;
  }

  private saveFile(dtoName: string, data: string) {
    const fileName = `${kebabCase(dtoName)}.d.ts`;
    const path = `${__dirname}/models/`;
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true });
    }
    writeFile(`${path}/${fileName}`, data, err => {
      if (err) {
        throw new Error(err.message);
      }
    });
  }

  private matchDtoName(definition: string) {
    const matches = definition.match(/[^?#\/definitions\/](\w+)/);
    if (matches !== null) {
      return matches[0];
    }
    throw new Error('Ошибка в партсинге #/definitions');
  }

  private createIndexFile() {
    const path = `${__dirname}/models/`;
    readdir(path, (err, files) => {
      if (err) {
        throw new Error(err.message);
      }
      let data = '';
      files.forEach(file => (data += `export * from "./${file.replace('.d.ts', '')}"\r\n`));
      writeFile(`${path}/index.d.ts`, data, err => {
        if (err) {
          throw new Error(err.message);
        }
      });
    });
  }
}

new DikiyParser().init().then(console.log).catch(console.error);

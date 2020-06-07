import { get } from 'http';
import { mkdirSync, existsSync, writeFile } from 'fs';
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
    const dtoName = def.title;
    let data = `export interface ${dtoName}  {\r\n`;
    Object.entries<any>(def.properties).forEach(([propName, propValue]) => {
      const { type } = propValue;

      if (type == TYPES.string) {
        data += `  ${propName}: ${TYPES.string};`;
      } else if (type == TYPES.integer || type === TYPES.number) {
        data += `  ${propName}: ${TYPES.number};`;
      } else if (type == TYPES.boolean) {
        data += `  ${propName}: ${TYPES.boolean};`;
      } else if (type == TYPES.object) {
        data += `  ${propName}: ${this.createObjectAdditionalData(propValue, data, deps)};`;
      } else if (type == TYPES.array) {
        data += `  ${propName}: any[];`;
      } else if (type === undefined && typeof propValue.$ref === 'string') {
        const dtoName = propValue.$ref.replace('#/definitions/', '');
        if (!deps.includes(propValue.$ref)) {
          data = `import { ${dtoName} } from "./${kebabCase(dtoName)}";\r\n${data}`;
          deps.push(propValue.$ref);
        }
        data += `  ${propName}: ${dtoName}`;
      } else {
        console.log(propName, propValue);
      }

      data += '\r\n';
    });
    return data + '}';
  }

  private createProp(){
    let data
  }

  private createObjectAdditionalData(propValue: { [k: string]: any }, deps: string[] = []): string {
    let data = '';
    if (propValue.additionalProperties) {
      const { type } = propValue.additionalProperties;
      if (type === TYPES.string) {
        data += `{ [k: string]: ${TYPES.string} }`;
      } else if (TYPES.integer || type === TYPES.number) {
        data += `{ [k: string]: ${TYPES.number} }`;
      }
    }

    return data;
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
}

new DikiyParser().init().then(console.log).catch(console.error);

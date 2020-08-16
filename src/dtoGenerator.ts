import { writeFile, readdir } from 'fs';
import { kebabCase } from 'lodash';
import { saveFile, TYPES } from './utils';

export class DikiyParser {
  generateDtos(data: any) {
    const { definitions } = data;
    for (const def of Object.values<any>(definitions)) {
      const fileName = this.matchDtoName(def.title);
      const fileData = this.createFileData(def);
      if(fileName !== null) {
        this.saveFile(fileName, fileData);
      }
     
    }
    this.createIndexFile();
  }

  private createFileData(def: { [k: string]: any }) {
    if (def.properties === undefined) {
      return '';
    }
    const deps: string[] = [];
    const imports: string[] = [];
    const dtoName = this.matchDtoName(def.title);
    let data = `export interface ${dtoName}  {\n`;
    Object.entries<any>(def.properties).forEach(([propName, propValue]) => {
      data += `  ${propName}: ${this.createProp(propValue, deps, imports)}`;
      data += '\n';
    });
    imports.forEach(i => (data = `${i}${data}`));
    return data + '}';
  }

  private createProp(propValue: { [k: string]: any }, deps: string[], imports: string[], ending = ';') {
    let prop = '';
    const { type } = propValue;
    if (type == TYPES.string) {
      prop += `${TYPES.string}`;
    } else if (type === TYPES.integer || type === TYPES.number) {
      prop += `${TYPES.number}`;
    } else if (type === TYPES.boolean) {
      prop += `${TYPES.boolean}`;
    } else if (type === TYPES.object) {
      if (propValue.additionalProperties) {
        prop += `{ [k: string]: ${this.createProp(propValue.additionalProperties, deps, imports)} }`;
      } else {
        prop += `{ [k: string]: any }`;
      }
    } else if (type == TYPES.array) {
      prop += `${this.createProp(propValue.items, deps, imports, '[]')}`;
    } else if (type === undefined && typeof propValue.$ref === 'string') {
      const depDtoName = this.matchDtoName(propValue.$ref);
      if (depDtoName !== null) {
        if (!deps.includes(propValue.$ref)) {
          imports.push(`import { ${depDtoName} } from "./${kebabCase(depDtoName)}";\n`);
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

  private saveFile(dtoName: string, data: string) {
    const fileName = `${kebabCase(dtoName)}.d.ts`;
    saveFile(fileName, 'models', data);
  }

  private matchDtoName(definition: string) {
    const matches = definition.match(/[^?#\/definitions\/](\w+)/);
    if (matches !== null) {
      return matches[0].trim();
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
      writeFile(`${path}/index.d.ts`, data, err => {
        if (err) {
          throw new Error(err.message);
        }
      });
    });
  }
}


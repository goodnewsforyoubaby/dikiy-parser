import { mkdirSync, existsSync, writeFile, readdir } from 'fs';
import { get } from 'http';
import fs from 'fs';
import kebabCase from 'lodash.kebabcase';
import { camelCase } from 'lodash';

interface Prop {
  pageable: boolean;
  str: string;
}

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

function filterArrayForUniqueValues(arr: string[]): string[] {
  return arr.filter((v, i, a) => a.indexOf(v) === i);
}

// function saveFile(dtoName: string, data: string) {
function saveFile(fileName: string, folder: string, data: string): void {
  // const fileName = `${kebabCase(dtoName)}.service.ts`;
  const path = `${__dirname}/${folder}/`;
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
  writeFile(`${path}/${fileName}`, data, err => {
    if (err) {
      throw new Error(err.message);
    }
  });
}

function matchDtoName(definition: string): (string | null) {
  // const matches = definition.match(/[^?#\/definitions\/](\w+)/);
  const matches = definition.match(/^#\/definitions\/(.+)/)
  if (matches !== null) {
    return matches[1].trim();
  } else {
    console.error('Ошибка в партсинге #/definitions', definition);
    return null;
  }
}

function pushUniqueValue(arr: any[], value: any) {
  if (arr.indexOf(value) === -1) {
    arr.push(value);
  }
}

function simpleCreateProp(propValue: { [k: string]: any}): string {
  let prop = '';
  const { type } = propValue;
  if (type == TYPES.string) {
    prop = `${TYPES.string}`;
  } else if (type === TYPES.integer || type === TYPES.number) {
    prop = `${TYPES.number}`;
  } else if (type === TYPES.boolean) {
    prop = `${TYPES.boolean}`;
  }
  return prop;
}

function createProp(propValue: { [k: string]: any }, deps: string[], imports: string[], ending = ''): Prop {
  let prop = '';
  let pageable = false;
  const { type } = propValue;
  if (type == TYPES.string) {
    prop += `${TYPES.string}`;
  } else if (type === TYPES.integer || type === TYPES.number) {
    prop += `${TYPES.number}`;
  } else if (type === TYPES.boolean) {
    prop += `${TYPES.boolean}`;
  } else if (type === TYPES.object) {
    if (propValue.additionalProperties) {
      prop += `{ [k: string]: ${createProp(propValue.additionalProperties, deps, imports).str} }`;
    } else {
      prop += `{ [k: string]: any }`;
    }
  } else if (type == TYPES.array) {
    prop += `${createProp(propValue.items, deps, imports, '[]').str}`;
  } else if (type === undefined && typeof propValue.$ref === 'string') {
    let depDtoName = matchDtoName(propValue.$ref);

    const regex = /(Page|PaginationResponse)«(.*)»/
    if (depDtoName) {
      const result = regex.exec(depDtoName);
      if (result) {
        depDtoName = result[2];
        pageable = true;
      }
    }

    // if (depDtoName !== null && !deps.includes(propValue.$ref)) {
    if (depDtoName !== null && !deps.includes(depDtoName)) {
      imports.push(depDtoName);
      deps.push(depDtoName);
    }
    prop += `${depDtoName}`;
  } else {
    throw new Error('Ошибка парсинга');
  }
  // return prop + ending;
  return { str: prop + ending, pageable };
}

function loadJsonFile(fileName: string): any {
  const path = process.cwd();
  // const rawdata = fs.readFileSync(__dirname + "/api-docs.json");
  const rawdata = fs.readFileSync(__dirname + '/' + fileName);
  return JSON.parse(rawdata.toString());
}

function createSwaggerRequest(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    get(url, res => {
      let data = '';
      res
        .on('data', chunk => (data += chunk))
        .on('end', () => resolve(JSON.stringify(data)))
        .on('error', reject);
    });
  });
}



export { 
  TYPES, 
  DEFAULTS, 
  Prop, 
  filterArrayForUniqueValues, 
  saveFile, 
  matchDtoName, 
  pushUniqueValue, 
  simpleCreateProp, 
  createProp,
  loadJsonFile,
  createSwaggerRequest,
};
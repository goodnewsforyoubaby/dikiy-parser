import { getFile, requestFile } from './utils';
import { generateServices} from './serviceGenerator';
import { DikiyParser } from './dtoGenerator';

interface GenerateOptions {
  services: boolean;
  dtos: boolean;
}

function generateJsStructure(data: any, generateOptions: GenerateOptions) {
  if (generateOptions.services) {
    generateServices(data);
  }

  if (generateOptions.dtos) {
    new DikiyParser().generateDtos(data);
  }
}

async function getJsonFromRequest(url: string) {
  return requestFile(url);
}

async function getJsonFromFile(path: string) {
  return getFile(path);
}

async function generate(dataPromise: Promise<string>, generateOptions: GenerateOptions) {
  const data = await dataPromise;
  generateJsStructure(JSON.parse(data), generateOptions);
}

generate(getJsonFromRequest('http://localhost:8080/v2/api-docs'), { services: false, dtos: true })
  .then(() => console.log('done'))
  .catch(err => console.error(err));

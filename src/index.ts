import { getJsonFile, createSwaggerRequest } from './utils';
import { generateServices} from './serviceGenerator';
import { DikiyParser } from './dtoGenerator';

interface GenerateOptions {
  services: boolean;
  dtos: boolean;
}

enum GenerateFileDataOptions {
  request,
  file,
}

function generateJsStructure(data: any, generateOptions: GenerateOptions) {
  if (generateOptions.services) {
    generateServices(data);
  }

  if (generateOptions.dtos) {
    new DikiyParser().generateDtos(data);
  }
}

async function getFileData(path: string, generateFileDataOptions: GenerateFileDataOptions): Promise<string> {
  let data = '';
  if (generateFileDataOptions === GenerateFileDataOptions.file) {
    data = getJsonFile(path);
  } else {
    data = await createSwaggerRequest(path);
  }
  return data;
}

async function generate(path: string, generateFileDataOptions: GenerateFileDataOptions, generateOptions: GenerateOptions) {
  const data = await getFileData(path, generateFileDataOptions);
  generateJsStructure(JSON.parse(data), generateOptions);
}

generate('http://localhost:8080/v2/api-docs', GenerateFileDataOptions.request, { services: false, dtos: true })
  .then(() => console.log('done'))
  .catch(err => console.error(err));

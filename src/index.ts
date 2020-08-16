import { getJsonFile, createSwaggerRequest } from './utils';
import { generateServices} from './serviceGenerator';
import { DikiyParser } from './dtoGenerator';

const DEFAULTS = {
  swaggerURL: 'http://localhost:8080/v2/api-docs',
};

async function generate(path: string, isFile = false, services = false) {
  let data = {};
  if (isFile) {
    data = getJsonFile(path);
  } else {
    data = await createSwaggerRequest(DEFAULTS.swaggerURL);
  }

  if (services) {
    generateServices(data);
  } else {
    new DikiyParser().generateDtos(data);
  }
}

generate('api-docs.json', true, true)
  .then(() => console.log('done'))
  .catch(err => console.error(err));

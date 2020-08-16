interface IControllerBase {
  type?: string;
  format?: string;
  $ref?: string;
  items?: IControllerItems;
  schema?: IControllerSchema;
}

interface IControllerSchema extends IControllerBase {
  additionalProperties: IControllerBase;
}
interface IControllerParameter extends IControllerBase {
  name: string;
  in: string;
  description: string;
  required: boolean,
  type: string;
  schema?: IControllerSchema;
  format?: string;
  default?: string;
  ref?: string;
  items?: IControllerItems;
}

interface IControllerItems extends IControllerBase {
  type?: string;
  format?: string;
  enum?: string[];
  $ref: string;
}

interface IControllerResponse {
  "200": {
    schema: IControllerSchema;
  }
}

interface IControllerMethod {
  tags: string[];
  summary: string;
  operationId: string;
  consumes: string[];
  produces: string[];
  parameters: IControllerParameter[];
  responses: {
    "200": {
      schema?: IControllerSchema;
    }
  }
}

export { 
  IControllerSchema,
  IControllerParameter,
  IControllerResponse,
  IControllerMethod,
  IControllerItems,
  IControllerBase,
}

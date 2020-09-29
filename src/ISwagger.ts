export interface IControllerBase {
  type?: string;
  format?: string;
  $ref?: string;
  items?: IControllerItems;
  schema?: IControllerSchema;
}

export interface IControllerSchema extends IControllerBase {
  additionalProperties: IControllerBase;
}

export interface IControllerParameter extends IControllerBase {
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

export interface IControllerItems extends IControllerBase {
  type?: string;
  format?: string;
  enum?: string[];
  $ref: string;
}

export interface IControllerMethod {
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

export interface IInterfaceParameter {
  type: string;
  name?: string;
  in?: string;
  description?: string;
  required?: string;
  schema?: string;
  allowEmptyValue?: boolean;
  items?: any;
  example?: boolean;
  $ref?: string;
  format?: string;
  enum?: string[];
  additionalProperties?: any;
  minimum?: number;
  maximum?: number;
}

export interface IInterfaceBody {
  type: string;
  properties?: { [k: string]: IInterfaceParameter };
  title: string;
  description?: string;
  allOf?: [string, IInterfaceBody];
}

export interface ISwaggerTag {
  name: string;
  description: string;
}

export interface ISwaggerInfo {
  version: string;
  title: string;
  contact: {
    name: string;
    email: string;
  },
  license: any;
}

export type ISwaggerPaths = { [path: string]: ISwaggerPathRequestTypes };
export type ISwaggerPathRequestTypes = { [requestType: string]: IControllerMethod };
export type ISwaggerDefinitions = { [definitionName: string]: IInterfaceBody };

export interface ISwagger {
  swagger: string;
  info: ISwaggerInfo;
  host: string;
  basePath: string;
  tags: ISwaggerTag[];
  paths: ISwaggerPaths;
  definitions: ISwaggerDefinitions;
}

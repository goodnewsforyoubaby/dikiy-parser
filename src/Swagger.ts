export interface ControllerBase {
  type?: string;
  format?: string;
  $ref?: string;
  items?: ControllerItems;
  schema?: ControllerSchema;
}

export interface ControllerSchema extends ControllerBase {
  additionalProperties: ControllerBase;
}

export interface ControllerParameter extends ControllerBase {
  name: string;
  in: string;
  description: string;
  required: boolean,
  type: string;
  schema?: ControllerSchema;
  format?: string;
  default?: string;
  ref?: string;
  items?: ControllerItems;
}

export interface ControllerItems extends ControllerBase {
  type?: string;
  format?: string;
  enum?: string[];
  $ref: string;
}

export interface ControllerMethod {
  tags: string[];
  summary: string;
  operationId: string;
  consumes: string[];
  produces: string[];
  parameters: ControllerParameter[];
  responses: {
    "200": {
      schema?: ControllerSchema;
    }
  }
}

export interface SwaggerDefinitionProperty {
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

export interface SwaggerDefinition {
  type: string;
  properties?: { [k: string]: SwaggerDefinitionProperty };
  title: string;
  description?: string;
  allOf?: [string, SwaggerDefinition];
}

export interface SwaggerTag {
  name: string;
  description: string;
}

export interface SwaggerInfo {
  version: string;
  title: string;
  contact: {
    name: string;
    email: string;
  },
  license: any;
}

export type SwaggerPaths = { [path: string]: SwaggerPathRequestTypes };
export type SwaggerPathRequestTypes = { [requestType: string]: ControllerMethod };
export type SwaggerDefinitions = { [definitionName: string]: SwaggerDefinition };

export interface Swagger {
  swagger: string;
  info: SwaggerInfo;
  host: string;
  basePath: string;
  tags: SwaggerTag[];
  paths: SwaggerPaths;
  definitions: SwaggerDefinitions;
}

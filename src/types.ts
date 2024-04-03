import type { z } from "./zod";
import type { Traffic } from "./traffic";
import type { IssueMap, trafficIssues } from "./issues";

//#region ROUTE DEFINITION
export type Method =
  | "post"
  | "get"
  | "patch"
  | "put"
  | "options"
  | "head"
  | "delete";

export type HeadersDefinition = Record<string, string | z.ZodType>;
export type ContentDefinition = z.ZodType | z.ZodRawShape;
export type ParamsDefinition = Record<string, true | z.ZodType> | undefined;
export type QueryDefinition = Record<string, true | z.ZodType> | undefined;

export type MessageDefinition = {
  mime: string | readonly string[];
  headers?: HeadersDefinition | undefined;
  optional?: boolean | undefined;
} & (
  | {
      raw: true;
      content?: undefined;
    }
  | {
      raw?: false;
      content: ContentDefinition;
    }
);

export type RequestDefinition = MessageDefinition & {
  params?: ParamsDefinition;
  query?: QueryDefinition;
};

export type ResponseDefinition = MessageDefinition & {
  status: number;
};

export interface RouteDefinition<ISSUES extends IssueMap> {
  method?: Method;
  path?: string;
  description?: string;
  request: RequestDefinition;
  response:
    | ResponseDefinition
    | readonly [ResponseDefinition, ...ResponseDefinition[]];
  issues: readonly (keyof ISSUES | keyof typeof trafficIssues)[];
}
//#endregion

//#region ROUTE
export type Params = Record<string, string>;

export type RouteHandler<
  ROUTE extends RouteDefinition<ISSUES>,
  ISSUES extends IssueMap
> = (context: RequestContext<ROUTE, ISSUES>) => Promise<Response>;

export type RawRouteContext = {
  request: Request;
  params: Params;
  traffic: Traffic;
};

export type Route = (context: RawRouteContext) => Promise<Response>;
//#endregion

//#region UTILS
type Fallback<T, F extends T> = T extends undefined ? F : T;
type ToArray<T> = T extends readonly any[] ? T : [T];
type Assert<T, U> = T extends U ? T : never;
//#endregion

//#region RESPONSE LOOKUP HELPER
type ResponseMap<T> = T extends readonly [infer U, ...infer V]
  ? ResponseLookup<U> & ResponseMap<V>
  : {};

type ResponseLookup<T> = T extends ResponseDefinition
  ? {
      [_ in T["status"]]: T["mime"] extends readonly string[]
        ? {
            [_ in T["mime"][number]]: T;
          }
        : T["mime"] extends string
        ? {
            [_ in T["mime"]]: T;
          }
        : {};
    }
  : {};
//#endregion

//#region REQUEST CONTEXT
export interface RequestContext<
  ROUTE extends RouteDefinition<any>,
  ISSUES extends IssueMap
> {
  request: Request;
  url: URL;
  headers: RequestHeaders<ToArray<ROUTE["request"]>>;
  content: RequestContent<
    Fallback<Fallback<ROUTE["request"], RequestDefinition>["content"], {}>,
    Fallback<ROUTE["request"], RequestDefinition>["optional"]
  >;
  params: RequestParams<
    Fallback<Fallback<ROUTE["request"], RequestDefinition>["params"], {}>
  >;
  query: RequestQuery<
    Fallback<Fallback<ROUTE["request"], RequestDefinition>["query"], {}>
  >;
  response: ResponseFactory<ResponseMap<ToArray<ROUTE["response"]>>>;
  issue: IssueResponseFactory<Extract<ROUTE["issues"][number], string>, ISSUES>;
  traffic: Traffic;
}

type RequestContent<CONTENT, OPTIONAL> =
  | {
      [K in keyof CONTENT]: {
        type: K;
        data: InferContentData<CONTENT[K]>;
      };
    }[keyof CONTENT]
  | (OPTIONAL extends undefined | false ? never : null);

type RequestHeaders<T> = {
  [K in keyof T]: InferHeaderType<T[K]>;
};

type RequestParams<T> = {
  [K in keyof T]: InferParamType<T[K]>;
};

type RequestQuery<T> = {
  [K in keyof T]: InferQueryType<T[K]>;
};

type ResponseFactory<RESPONSE_MAP> = <
  STATUS extends keyof RESPONSE_MAP,
  TYPE extends keyof RESPONSE_MAP[STATUS],
  DATA extends InferContentData<
    Assert<RESPONSE_MAP[STATUS][TYPE], ResponseDefinition>["content"]
  >,
  HEADERS extends InferHeaders<
    Assert<RESPONSE_MAP[STATUS][TYPE], ResponseDefinition>["headers"]
  >,
  OPTIONAL extends Assert<
    RESPONSE_MAP[STATUS][TYPE],
    ResponseDefinition
  >["optional"]
>(
  ...args: [
    status: STATUS,
    type: TYPE,
    ...(OPTIONAL extends true ? [data?: DATA | undefined] : [data: DATA]),
    headers?: HEADERS | undefined
  ]
) => Promise<Response>;

type IssueResponseFactory<ALLOWED extends string, ISSUES extends IssueMap> = <
  CODE extends keyof Pick<ISSUES, ALLOWED>
>(
  code: CODE,
  ...args: Parameters<ISSUES[CODE]>
) => Promise<Response>;
//#endregion

//#region INFER
type InferContentData<T> = T extends z.ZodType
  ? z.infer<T>
  : T extends z.ZodRawShape
  ? z.infer<z.ZodObject<T>>
  : unknown;
type InferHeaderType<T> = T extends z.ZodType ? z.infer<T> : string;
type InferHeaders<HEADERS> = HEADERS extends Record<string, any>
  ? {
      [K in keyof HEADERS]: InferHeaderType<HEADERS[K]>;
    }
  : unknown;
type InferParamType<T> = T extends z.ZodType ? z.infer<T> : string;
type InferQueryType<T> = T extends z.ZodType ? z.infer<T> : string;
//#endregion

import { Issues, type IssueMap, trafficIssues, type Issue } from "./issues";
import { isArray, type BodyInit, type HeadersInit } from "./utils";
import {
  type RequestContext,
  type Route,
  type RouteDefinition,
  type RouteHandler,
} from "./types";
import { Mime } from "./mime";
import { ZodType } from "zod";
import { StatusCode } from "./status";
import { z } from "./zod";

export interface TrafficOptions<ISSUES extends IssueMap> {
  issues: ISSUES;
}

export class Traffic<ISSUES extends IssueMap = {}> {
  static async parse(request: Request): Promise<{ value: unknown } | null> {
    const contentType = request.headers.get("Content-Type");
    const mime = contentType ? new Mime(contentType) : null;

    switch (mime?.suffix ?? mime?.subtype) {
      case "json":
        return { value: await request.json() };

      case "plain":
        return { value: await request.text() };

      case "form-data":
        return { value: await request.formData() };
    }

    return null;
  }

  static async seralize(
    data: unknown,
    type: string
  ): Promise<{ value: string } | null> {
    const mime = type ? new Mime(type) : null;

    switch (mime?.suffix ?? mime?.subtype) {
      case "json":
        return { value: JSON.stringify(data) };

      case "plain":
        return { value: String(data) };
    }

    return null;
  }

  readonly issues: Issues<ISSUES & Omit<typeof trafficIssues, keyof ISSUES>>;

  parse = Traffic.parse;
  serialize = Traffic.seralize;
  defaultResponseType = "application/json";

  constructor(options?: TrafficOptions<ISSUES>) {
    this.issues = new Issues<any>({
      ...trafficIssues,
      ...options?.issues,
    });
  }

  response(
    status: StatusCode = StatusCode.Ok,
    body?: BodyInit | undefined,
    headers?: HeadersInit | undefined
  ) {
    return new Response(body, {
      status,
      // exact optional
      ...(headers && { ...headers }),
    });
  }

  route<const ROUTE extends RouteDefinition<ISSUES>>(
    definition: ROUTE,
    handler: RouteHandler<ROUTE, ISSUES & typeof trafficIssues>
  ): Route {
    return async ({ params: rawParams, request, traffic }) => {
      const params: Record<string, unknown> = {};
      const query: Record<string, unknown> = {};
      const headers: Record<string, unknown> = {};
      let content: { type: string; data: unknown } | null = null;

      const accept = request.headers.get("Accept") ?? this.defaultResponseType;

      const responseFactory = async (
        status: number,
        type: string,
        rawData?: any,
        headers?: any
      ): Promise<Response> => {
        const responses = isArray(definition.response)
          ? definition.response
          : [definition.response];
        const def = responses.find(
          (r) => r.status === status && r.mime === type
        )!;

        if (def.raw) {
          return traffic.response(status, rawData, headers);
        } else {
          const shape =
            def.content instanceof ZodType
              ? def.content
              : z.object(def.content);
          const result = shape.safeParse(rawData);

          if (result.success) {
            return traffic.response(status, result.data, headers);
          } else {
            console.error(
              new Error("Response content is invalid.", {
                cause: result.error,
              })
            );
            const issue = traffic.issues.new("/traffic/unknown");
            return issueResponseFactory(issue);
          }
        }
      };

      const issueResponseFactory = async (
        issue: Issue,
        headers?: any
      ): Promise<Response> => {
        let result: { value: string } | null = null;
        try {
          result = await traffic.serialize(issue, accept);

          if (result === null) {
            console.error(new Error("Failed to serialize issue response."));
          }
        } catch (error) {
          console.error(
            new Error("Failed to serialize issue response.", {
              cause: error,
            })
          );
        }

        return new Response(result?.value, {
          status: issue.status,
          headers,
        });
      };

      if (definition.request.params) {
        for (const [key, schema] of Object.entries(definition.request.params)) {
          const value = rawParams[key];
          const shape = schema === true ? z.string() : schema;
          const result = shape.safeParse(value);

          if (result.success) {
            params[key] = result.data;
          } else {
            const issue = traffic.issues.new(
              "/traffic/request/invalid-params",
              result.error
            );
            return issueResponseFactory(issue);
          }
        }
      }

      if (definition.request.query) {
        const searchParams = new URL(request.url).searchParams;

        for (const [key, schema] of Object.entries(definition.request.query)) {
          const value = searchParams.get(key);
          const shape = schema === true ? z.string() : schema;
          const result = shape.safeParse(value);

          if (result.success) {
            query[key] = result.data;
          } else {
            const issue = traffic.issues.new(
              "/traffic/request/invalid-query",
              result.error
            );
            return issueResponseFactory(issue);
          }
        }
      }

      if (definition.request.headers) {
        const searchParams = new URL(request.url).searchParams;

        for (const [key, schema] of Object.entries(
          definition.request.headers
        )) {
          const value = searchParams.get(key);
          const shape = typeof schema === "string" ? z.literal(schema) : schema;
          const result = shape.safeParse(value);

          if (result.success) {
            headers[key] = result.data;
          } else {
            const issue = traffic.issues.new(
              "/traffic/request/invalid-headers",
              result.error
            );
            return issueResponseFactory(issue);
          }
        }
      }

      const rawContentType = request.headers.get("Content-Type");
      const contentType = rawContentType ? new Mime(rawContentType) : null;

      // If a Content-Type header field is not present, the recipient MAY
      // either assume a media type of "application/octet-stream" [...] or
      // examine the data to determine its type. (RFC7231, Section 3.1.1)
      const type = contentType?.type ?? "application/octet-stream";
      const subtype = type.split("+", 2).pop()!;

      const supportedTypes = isArray(definition.request.mime)
        ? definition.request.mime
        : [definition.request.mime];
      if (!supportedTypes.includes(subtype)) {
        const error = traffic.issues.new(
          "/traffic/request/unsupported-content-type",
          supportedTypes
        );
        return new Response(JSON.stringify(error), {
          status: error.status,
        });
      }

      if (definition.request.content) {
        const result1 = await traffic.parse(request);

        if (!result1) {
          const issue = traffic.issues.new(
            "/traffic/request/unsupported-content"
          );
          return issueResponseFactory(issue);
        }

        const shape =
          definition.request.content instanceof ZodType
            ? definition.request.content
            : z.object(definition.request.content);

        const result2 = shape.safeParse(result1.value);

        if (result2.success) {
          content = {
            type,
            data: result2.data,
          };
        } else {
          const issue = traffic.issues.new(
            "/traffic/request/invalid-content",
            result2.error
          );
          return issueResponseFactory(issue);
        }
      }

      type X = RequestContext<ROUTE, ISSUES>;
      const event: X = {
        request,
        url: new URL(request.url) as URL,
        params: params as X["params"],
        query: query as X["query"],
        headers: headers as X["headers"],
        content: content as X["content"],
        response: responseFactory as X["response"],
        issue: issueResponseFactory as X["issue"],
        traffic,
      };

      const response = await handler(event);
      return response;
    };
  }
}

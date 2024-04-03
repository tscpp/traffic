import type { ZodError } from "zod";
import type { StatusCode } from ".";

export interface Issue {
  code: string;
  status: StatusCode;
  deflected?: boolean;
  // description: string;
  headers?: Record<string, string>
}

export interface IssueFactory {
  (...args: any): Omit<Issue, "code">;
}

export interface IssueMap {
  [code: string]: IssueFactory;
}

export class Issues<ISSUES extends IssueMap> {
  constructor(protected issues: ISSUES) {}

  new<K extends keyof ISSUES>(
    code: K,
    ...args: Parameters<ISSUES[K]>
  ): ReturnType<ISSUES[K]> & { code: K } {
    const issue = this.issues[code]!(...(args as any[])) as any;
    issue.code = code;
    issue.deflected ??= false;
    return issue;
  }
  override<CODE extends keyof ISSUES>(code: CODE, factory: ISSUES[CODE]): this {
    this.issues[code] = factory;
    return this;
  }
}

export const trafficIssues = {
  "/traffic/request/invalid-params": (error: ZodError) => ({
    status: 400,
    deflected: true,
    description: error.issues[0]!.message,
    issues: error.issues,
  }),
  "/traffic/request/invalid-query": (error: ZodError) => ({
    status: 400,
    deflected: true,
    description: error.issues[0]!.message,
    issues: error.issues,
  }),
  "/traffic/request/invalid-headers": (error: ZodError) => ({
    status: 400,
    deflected: true,
    description: error.issues[0]!.message,
    issues: error.issues,
  }),
  "/traffic/request/invalid-content": (error: ZodError) => ({
    status: 400,
    deflected: true,
    description: error.issues[0]!.message,
    issues: error.issues,
  }),
  "/traffic/request/unsupported-content-type": (
    supported: readonly string[]
  ) => ({
    status: 400,
    deflected: true,
    description: "Request content type is not supported.",
    supported,
  }),
  "/traffic/request/unsupported-content": () => ({
    status: 400,
    deflected: false,
    description: "Server is unable to parse the provided content.",
  }),
  "/traffic/unknown": () => ({
    status: 500,
    deflected: false,
    description: "Unknown server error.",
  }),
};

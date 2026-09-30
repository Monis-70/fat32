import axios, { AxiosError, type AxiosRequestConfig } from "axios";
import type { ZodType } from "zod";

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000"
).replace(/\/+$/, "");

export const API_ROOT = `${API_BASE_URL}/api/v1`;

export const http = axios.create({
  baseURL: API_ROOT,
  timeout: 120_000,
  headers: { Accept: "application/json" },
});

export type ApiErrorKind =
  | "offline"
  | "not_found"
  | "not_ready"
  | "expired"
  | "unsupported"
  | "too_large"
  | "validation"
  | "server"
  | "unknown";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly code: string | null;
  readonly hint: string | null;
  readonly details: unknown;

  constructor(
    message: string,
    kind: ApiErrorKind,
    status: number | null,
    code: string | null,
    hint: string | null,
    details: unknown = null,
  ) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.hint = hint;
    this.details = details;
  }
}

type BackendDetail = {
  code?: string;
  message?: string;
  hint?: string | null;
  errors?: { field: string; message: string }[];
};

function kindForStatus(status: number | null, code: string | null): ApiErrorKind {
  if (status === null) return "offline";
  if (status === 404) return "not_found";
  if (status === 409) return "not_ready";
  if (status === 410) return "expired";
  if (status === 413) return "too_large";
  if (status === 415 || code === "unsupported_extension") return "unsupported";
  if (status === 416 || status === 422) return "validation";
  if (status >= 500) return "server";
  return "unknown";
}

export function normaliseError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ detail?: BackendDetail | string }>;
    const status = axiosError.response?.status ?? null;
    const detail = axiosError.response?.data?.detail;
    if (typeof detail === "string") {
      return new ApiError(detail, kindForStatus(status, null), status, null, null);
    }
    if (detail && typeof detail === "object") {
      return new ApiError(
        detail.message ?? axiosError.message,
        kindForStatus(status, detail.code ?? null),
        status,
        detail.code ?? null,
        detail.hint ?? null,
        detail.errors ?? null,
      );
    }
    if (status === null) {
      return new ApiError(
        "The FATScope analysis service is unreachable.",
        "offline",
        null,
        "backend_offline",
        `Start the backend and confirm NEXT_PUBLIC_API_BASE_URL points at ${API_BASE_URL}.`,
      );
    }
    return new ApiError(axiosError.message, kindForStatus(status, null), status, null, null);
  }
  if (error instanceof Error) {
    return new ApiError(error.message, "unknown", null, null, null);
  }
  return new ApiError("An unexpected error occurred.", "unknown", null, null, null);
}

export async function request<T>(
  schema: ZodType<T>,
  config: AxiosRequestConfig,
): Promise<T> {
  try {
    const response = await http.request(config);
    const parsed = schema.safeParse(response.data);
    if (!parsed.success) {
      throw new ApiError(
        "The analysis service returned data in an unexpected shape.",
        "server",
        response.status,
        "schema_mismatch",
        parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
      );
    }
    return parsed.data;
  } catch (error) {
    throw normaliseError(error);
  }
}

export function absoluteUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("/api/")) return `${API_BASE_URL}${path}`;
  return `${API_ROOT}${path.startsWith("/") ? path : `/${path}`}`;
}

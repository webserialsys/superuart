import { API_BASE_URL } from "@/lib/config";

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: BodyInit | Record<string, unknown>;
  token?: string;
  headers?: HeadersInit;
  signal?: AbortSignal;
};

export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

function isJsonLikeBody(body: RequestOptions["body"]): body is Record<string, unknown> {
  return (
    typeof body === "object" &&
    body !== null &&
    !(body instanceof FormData) &&
    !(body instanceof URLSearchParams) &&
    !(body instanceof Blob)
  );
}

async function getErrorDetail(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { detail?: string };
    if (typeof data.detail === "string") {
      return data.detail;
    }
  } catch {
    // ignore parse error and fallback to status text
  }

  return response.statusText || "Request failed";
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);

  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const requestInit: RequestInit = {
    method: options.method ?? "GET",
    headers,
    credentials: "include",
    signal: options.signal,
  };

  if (options.body !== undefined) {
    if (isJsonLikeBody(options.body)) {
      headers.set("Content-Type", "application/json");
      requestInit.body = JSON.stringify(options.body);
    } else {
      requestInit.body = options.body;
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, requestInit);

  if (!response.ok) {
    const detail = await getErrorDetail(response);
    throw new ApiError(response.status, detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

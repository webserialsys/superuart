export type TokenResponse = {
  access_token: string;
  token_type: string;
};

export type User = {
  uuid: string;
  email: string;
  full_name: string;
  created_at: string;
  updated_at: string | null;
};

export type HealthResponse = {
  status: string;
  environment: string;
  version: string;
  timestamp: string;
};

export type ReadyResponse = {
  status: string;
  environment: string;
  version: string;
  app: string;
  database: string;
  redis: string;
  timestamp: string;
};

export type TaskCreateResponse = {
  id: string;
};

export type TaskInfoResponse = Record<string, unknown> | null;

export type PaginatedResponse<T> = {
  data: T[];
  total_count?: number;
  page?: number;
  items_per_page?: number;
  total_pages?: number;
};

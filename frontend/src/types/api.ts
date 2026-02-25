export type TokenResponse = {
  access_token: string;
  token_type: string;
};

export type User = {
  uuid: string;
  email: string;
  full_name: string;
  role: "student" | "teacher";
  created_at: string;
  updated_at: string | null;
};

export type DeviceStatus = "AVAILABLE" | "BUSY" | "OFFLINE";

export type HostStatus = "ONLINE" | "OFFLINE";

export type Host = {
  uuid: string;
  name: string;
  status: HostStatus;
  user_uuid: string;
  created_at: string;
  updated_at: string | null;
};

export type HostCreateResponse = {
  host: Host;
  api_key: string;
};

export type Device = {
  uuid: string;
  name: string;
  port: string;
  baudrate: number;
  status: DeviceStatus;
  host_uuid: string;
  created_at: string;
  updated_at: string | null;
};

export type Access = {
  uuid: string;
  user_uuid: string;
  device_uuid: string;
  granted_at: string;
  expires_at: string | null;
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

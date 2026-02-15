import type { TaskCreateResponse, TaskInfoResponse } from "@/types/api";

import { apiRequest } from "./client";

export async function createTask(message: string): Promise<TaskCreateResponse> {
  const query = new URLSearchParams({ message });
  return apiRequest<TaskCreateResponse>(`/api/v1/tasks/task?${query.toString()}`, {
    method: "POST",
  });
}

export async function getTask(taskId: string): Promise<TaskInfoResponse> {
  return apiRequest<TaskInfoResponse>(`/api/v1/tasks/task/${taskId}`);
}

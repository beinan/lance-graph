type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit & { method: HttpMethod }) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    },
    ...options
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new ApiError(detail || response.statusText, response.status);
  }

  if (response.status === 204) {
    return null as T;
  }
  return (await response.json()) as T;
}

export const apiClient = {
  get<T>(path: string) {
    return request<T>(path, { method: "GET" });
  },
  post<T>(path: string, data: unknown) {
    return request<T>(path, { method: "POST", body: JSON.stringify(data) });
  },
  put<T>(path: string, data: unknown) {
    return request<T>(path, { method: "PUT", body: JSON.stringify(data) });
  },
  delete<T>(path: string) {
    return request<T>(path, { method: "DELETE" });
  }
};

export type { ApiError };

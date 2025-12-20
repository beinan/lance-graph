const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
class ApiError extends Error {
    constructor(message, status) {
        super(message);
        Object.defineProperty(this, "status", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.status = status;
    }
}
async function request(path, options) {
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
        return null;
    }
    return (await response.json());
}
export const apiClient = {
    get(path) {
        return request(path, { method: "GET" });
    },
    post(path, data) {
        return request(path, { method: "POST", body: JSON.stringify(data) });
    },
    put(path, data) {
        return request(path, { method: "PUT", body: JSON.stringify(data) });
    },
    delete(path) {
        return request(path, { method: "DELETE" });
    }
};

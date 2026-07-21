import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";
import { logger } from "../../lib/logger";

const DEFAULT_GUARDIAN_BASE_URL = "https://guardian.headout.com";

const GUARDIAN_BASE_URL =
  process.env["GUARDIAN_BASE_URL"] ?? DEFAULT_GUARDIAN_BASE_URL;

export type TApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "BAD_GATEWAY"
  | "INTERNAL";

export class GuardianError extends Error {
  override readonly name = "GuardianError";
  readonly status: number;
  readonly code: TApiErrorCode;
  readonly responseBody: unknown;

  constructor(
    message: string,
    status: number,
    code: TApiErrorCode,
    responseBody: unknown,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.status = status;
    this.code = code;
    this.responseBody = responseBody;
  }
}

function mapStatusToCode(status: number): TApiErrorCode {
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 404) return "NOT_FOUND";
  return "BAD_GATEWAY";
}

export const guardianClient: AxiosInstance = axios.create({
  baseURL: GUARDIAN_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

guardianClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const rawCookie = config.rawCookie;
    if (rawCookie) {
      if (!config.headers) {
        config.headers = new AxiosHeaders();
      }
      config.headers.set("Cookie", rawCookie);
    }
    return config;
  },
);

guardianClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (error instanceof AxiosError) {
      const status = error.response?.status ?? 0;
      const body = error.response?.data;
      const url = error.config?.url ?? "";
      const method = (error.config?.method ?? "").toUpperCase();

      logger.error({ status, body, url, method }, "Guardian request failed");

      const effectiveStatus = status > 0 ? status : 502;
      const message =
        status > 0
          ? `Guardian ${method} ${url} returned ${status}`
          : `Guardian ${method} ${url} failed: ${error.message}`;

      return Promise.reject(
        new GuardianError(
          message,
          effectiveStatus,
          mapStatusToCode(effectiveStatus),
          body,
        ),
      );
    }
    return Promise.reject(error);
  },
);

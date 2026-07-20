/* eslint-disable @typescript-eslint/naming-convention -- augmenting third-party axios module; interface names must match upstream exactly. */
import "axios";

declare module "axios" {
  export interface AxiosRequestConfig {
    rawCookie?: string;
  }
  export interface InternalAxiosRequestConfig {
    rawCookie?: string;
  }
}

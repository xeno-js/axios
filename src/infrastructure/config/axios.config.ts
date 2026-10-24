import type { Optional, RequestContext } from "@xeno-js/core"
import type { AxiosError, AxiosResponse, CreateAxiosDefaults, InternalAxiosRequestConfig } from "axios"

interface AxiosInterceptorsConfig {
    readonly request?: {
        readonly onFulfilled?: (value: InternalAxiosRequestConfig) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>
        readonly onRejected?: (error: unknown) => unknown
    }[]
    readonly response?: {
        readonly onFulfilled?: (value: AxiosResponse) => AxiosResponse | Promise<AxiosResponse>
        readonly onRejected?: (error: AxiosError) => unknown
    }[]
}

export interface AxiosConfig extends CreateAxiosDefaults {
    readonly interceptors?: AxiosInterceptorsConfig
    readonly ctxAccessor?: () => Optional<RequestContext>
}
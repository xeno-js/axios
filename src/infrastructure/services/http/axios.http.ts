import type { HttpOptions, HttpRequest, HttpResponse, IHttpClient, Optional } from '@xeno-js/core';
import { AppError, ERROR_CODE_MESSAGES, ERROR_CODES, Guards, HttpHelper, STATUS_CODES } from '@xeno-js/core';
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { AxiosError } from 'axios'

export class AxiosHttpClient implements IHttpClient {
  constructor(private readonly _client: AxiosInstance) {}

  private async executInAsync<TResponse = unknown>(
    callback: () => Promise<HttpResponse<TResponse>>,
    opts: { signal: Optional<AbortSignal>; name: string },
  ): Promise<HttpResponse<TResponse>> {
    AppError.throwIfAborted(opts.signal, opts.name)

    try {
      return await callback()
    } catch (error: unknown) {
      this.handleError(error, 'AxiosHttpClient.get')
    }
  }

  public async get<TResponse = unknown>(
    url: string,
    options?: Optional<Omit<HttpRequest<never>, HttpOptions>>,
  ): Promise<HttpResponse<TResponse>> {
    return await this.executInAsync(
      async () => {
        const response = await this._client.get<TResponse>(url, this.buildConfig(options))
        return this.handleResponse(response)
      },
      { signal: options?.signal, name: 'AxiosHttpClient.get' },
    )
  }

  public async post<TResponse = unknown, TBody = unknown>(
    url: string,
    body?: Optional<TBody>,
    options?: Optional<Omit<HttpRequest<TBody>, HttpOptions>>,
  ): Promise<HttpResponse<TResponse>> {
    return await this.executInAsync(
      async () => {
        const response = await this._client.post<TResponse>(url, body, this.buildConfig(options))
        return this.handleResponse(response)
      },
      { signal: options?.signal, name: 'AxiosHttpClient.post' },
    )
  }

  public async put<TResponse = unknown, TBody = unknown>(
    url: string,
    body?: Optional<TBody>,
    options?: Optional<Omit<HttpRequest<TBody>, HttpOptions>>,
  ): Promise<HttpResponse<TResponse>> {
    return await this.executInAsync(
      async () => {
        const response = await this._client.put<TResponse>(url, body, this.buildConfig(options))
        return this.handleResponse(response)
      },
      { signal: options?.signal, name: 'AxiosHttpClient.put' },
    )
  }

  public async patch<TResponse = unknown, TBody = unknown>(
    url: string,
    body?: Optional<TBody>,
    options?: Optional<Omit<HttpRequest<TBody>, HttpOptions>>,
  ): Promise<HttpResponse<TResponse>> {
    return await this.executInAsync(
      async () => {
        const response = await this._client.patch<TResponse>(url, body, this.buildConfig(options))
        return this.handleResponse(response)
      },
      { signal: options?.signal, name: 'AxiosHttpClient.patch' },
    )
  }

  public async delete<TResponse = unknown>(
    url: string,
    options?: Optional<Omit<HttpRequest<never>, HttpOptions>>,
  ): Promise<HttpResponse<TResponse>> {
    return await this.executInAsync(
      async () => {
        const response = await this._client.delete<TResponse>(url, this.buildConfig(options))
        return this.handleResponse(response)
      },
      { signal: options?.signal, name: 'AxiosHttpClient.delete' },
    )
  }

  private buildConfig(
    options?: Optional<Omit<HttpRequest<unknown>, HttpOptions>>,
  ): AxiosRequestConfig {
    return {
      headers: options?.headers,
      params: options?.query,
      signal: options?.signal,
      timeout: options?.timeoutMs,
      validateStatus: () => true,
    }
  }

  private handleResponse<TResponse>(response: AxiosResponse<TResponse>): HttpResponse<TResponse> {
    if (!Guards.isDefined(response.status) || response.status >= 400) {
      AppError.throw({
        code: ERROR_CODES.EXTERNAL_SERVICE_ERROR,
        message: ERROR_CODE_MESSAGES[ERROR_CODES.EXTERNAL_SERVICE_ERROR],
        status: response.status,
        name: 'AxiosHttpClientException',
        cause: new AxiosError(
          `Request failed with status code ${response.status}`,
          ERROR_CODES.EXTERNAL_SERVICE_ERROR,
          response.config,
          response.request,
          response,
        ),
      })
    }

    return {
      status: response.status,
      ok: response.status >= 200 && response.status < 300,
      headers: HttpHelper.normalizeHeaders(response.headers),
      data: response.data,
    }
  }

  private handleError(error: unknown, name: string): never {
    if (error instanceof AppError) throw error

    const status =
      error instanceof AxiosError && Guards.isDefined(error.response)
        ? error.response.status
        : STATUS_CODES.INTERNAL_SERVER_ERROR

    AppError.throw({
      code: ERROR_CODES.EXTERNAL_SERVICE_ERROR,
      message: ERROR_CODE_MESSAGES[ERROR_CODES.EXTERNAL_SERVICE_ERROR],
      status,
      name,
      cause: error,
    })
  }
}

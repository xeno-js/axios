import type { Optional } from '@xeno-js/core'
import { AppError, ERROR_CODES, STATUS_CODES } from '@xeno-js/core'
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { AxiosError } from 'axios'
import { describe, expect, it, vi } from 'vitest'

import { AxiosHttpClient } from '../axios.http'

interface RequestConfigSnapshot {
  url: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers: unknown
  params: unknown
  data: unknown
  signal: Optional<AbortSignal> | undefined
  timeout: number | undefined
  validateStatus: (status: number) => boolean
}

function makeAxiosResponse<T>(overrides: Partial<AxiosResponse<T>> = {}): AxiosResponse<T> {
  return {
    data: undefined as T,
    status: STATUS_CODES.OK,
    statusText: 'OK',
    headers: {},
    config: { headers: {} } as AxiosResponse<T>['config'],
    request: {},
    ...overrides,
  }
}

function makeRequestMock() {
  return vi.fn<(config: unknown) => Promise<AxiosResponse<unknown>>>()
}

function makeClient(requestMock: ReturnType<typeof makeRequestMock>) {
  return {
    get: vi.fn((url: string, config: AxiosRequestConfig) =>
      requestMock({ ...config, url, method: 'GET', data: undefined }),
    ),
    post: vi.fn((url: string, data: unknown, config: AxiosRequestConfig) =>
      requestMock({ ...config, url, method: 'POST', data }),
    ),
    put: vi.fn((url: string, data: unknown, config: AxiosRequestConfig) =>
      requestMock({ ...config, url, method: 'PUT', data }),
    ),
    patch: vi.fn((url: string, data: unknown, config: AxiosRequestConfig) =>
      requestMock({ ...config, url, method: 'PATCH', data }),
    ),
    delete: vi.fn((url: string, config: AxiosRequestConfig) =>
      requestMock({ ...config, url, method: 'DELETE', data: undefined }),
    ),
  } as unknown as AxiosInstance
}

describe('AxiosHttpClient', () => {
  it('get calls axios request and returns normalized response for 2xx status', async () => {
    const requestMock = makeRequestMock()
    requestMock.mockResolvedValue(
      makeAxiosResponse({
        status: STATUS_CODES.OK,
        headers: { 'x-id': ['a', 'b'], 'x-count': 2 },
        data: { id: '1' },
      }),
    )

    const client = new AxiosHttpClient(makeClient(requestMock))
    const signal = new AbortController().signal

    const response = await client.get<{ id: string }>('/users', {
      headers: { authorization: 'Bearer token' },
      query: { page: 1 },
      signal,
      timeoutMs: 900,
    })

    expect(requestMock).toHaveBeenCalledTimes(1)
    const sentConfig = requestMock.mock.calls[0][0] as RequestConfigSnapshot
    expect(sentConfig).toMatchObject({
      url: '/users',
      method: 'GET',
      headers: { authorization: 'Bearer token' },
      params: { page: 1 },
      data: undefined,
      signal,
      timeout: 900,
    })
    expect(sentConfig.validateStatus(500)).toBe(true)

    expect(response).toEqual({
      status: STATUS_CODES.OK,
      ok: true,
      headers: { 'x-id': 'a,b', 'x-count': '2' },
      data: { id: '1' },
    })
  })

  it('throws AppError when axios returns status >= 400', async () => {
    const requestMock = makeRequestMock()
    requestMock.mockResolvedValue(
      makeAxiosResponse({
        status: STATUS_CODES.BAD_REQUEST,
        data: { message: 'bad request' },
      }),
    )

    const client = new AxiosHttpClient(makeClient(requestMock))

    await expect(client.get('/users', undefined)).rejects.toMatchObject({
      name: 'AxiosHttpClientException',
      code: ERROR_CODES.EXTERNAL_SERVICE_ERROR,
      status: STATUS_CODES.BAD_REQUEST,
    })
  })

  it('throws AppError when axios response status is undefined', async () => {
    const requestMock = makeRequestMock()
    requestMock.mockResolvedValue(
      makeAxiosResponse({
        status: undefined as unknown as number,
      }),
    )

    const client = new AxiosHttpClient(makeClient(requestMock))

    await expect(client.get('/users', undefined)).rejects.toMatchObject({
      name: 'AxiosHttpClientException',
      code: ERROR_CODES.EXTERNAL_SERVICE_ERROR,
      status: undefined,
    })
  })

  it('maps AxiosError with response status to AppError preserving status', async () => {
    const requestMock = makeRequestMock()
    requestMock.mockRejectedValue(
      new AxiosError(
        'network failed',
        undefined,
        undefined,
        undefined,
        makeAxiosResponse({ status: STATUS_CODES.SERVICE_UNAVAILABLE }),
      ),
    )

    const client = new AxiosHttpClient(makeClient(requestMock))

    await expect(client.get('/users', undefined)).rejects.toMatchObject({
      name: 'AxiosHttpClient.get',
      code: ERROR_CODES.EXTERNAL_SERVICE_ERROR,
      status: STATUS_CODES.SERVICE_UNAVAILABLE,
    })
  })

  it('maps generic thrown error to AppError with internal server error status', async () => {
    const requestMock = makeRequestMock()
    requestMock.mockRejectedValue(new Error('boom'))

    const client = new AxiosHttpClient(makeClient(requestMock))

    await expect(client.get('/users', undefined)).rejects.toMatchObject({
      name: 'AxiosHttpClient.get',
      code: ERROR_CODES.EXTERNAL_SERVICE_ERROR,
      status: STATUS_CODES.INTERNAL_SERVER_ERROR,
    })
  })

  it('throws aborted AppError before calling axios when signal is already aborted', async () => {
    const requestMock = makeRequestMock()
    const client = new AxiosHttpClient(makeClient(requestMock))

    const controller = new AbortController()
    controller.abort()

    await expect(
      client.get('/users', {
        headers: undefined,
        query: undefined,
        signal: controller.signal,
        timeoutMs: undefined,
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.ABORTED,
      status: STATUS_CODES.ABORTED,
      name: 'AxiosHttpClient.get',
    })
    expect(requestMock).not.toHaveBeenCalled()
  })

  it('post, put, patch and delete build requests with the expected method/body/options', async () => {
    const requestMock = makeRequestMock()
    requestMock.mockResolvedValue(makeAxiosResponse({ data: { ok: true } }))

    const client = new AxiosHttpClient(makeClient(requestMock))
    const options = {
      headers: { authorization: 'Bearer token' },
      query: { include: true },
      signal: undefined,
      timeoutMs: 250,
    }

    await client.post('/items', { a: 1 }, options)
    await client.put('/items/1', { b: 2 }, options)
    await client.patch('/items/1', { c: 3 }, options)
    await client.delete('/items/1', options)

    expect(requestMock).toHaveBeenCalledTimes(4)

    const firstConfig = requestMock.mock.calls[0][0] as RequestConfigSnapshot
    expect(firstConfig).toMatchObject({
      url: '/items',
      method: 'POST',
      headers: options.headers,
      params: options.query,
      data: { a: 1 },
      signal: options.signal,
      timeout: options.timeoutMs,
    })

    const secondConfig = requestMock.mock.calls[1][0] as RequestConfigSnapshot
    expect(secondConfig).toMatchObject({
      url: '/items/1',
      method: 'PUT',
      headers: options.headers,
      params: options.query,
      data: { b: 2 },
      signal: options.signal,
      timeout: options.timeoutMs,
    })

    const thirdConfig = requestMock.mock.calls[2][0] as RequestConfigSnapshot
    expect(thirdConfig).toMatchObject({
      url: '/items/1',
      method: 'PATCH',
      headers: options.headers,
      params: options.query,
      data: { c: 3 },
      signal: options.signal,
      timeout: options.timeoutMs,
    })

    const fourthConfig = requestMock.mock.calls[3][0] as RequestConfigSnapshot
    expect(fourthConfig).toMatchObject({
      url: '/items/1',
      method: 'DELETE',
      headers: options.headers,
      params: options.query,
      data: undefined,
      signal: options.signal,
      timeout: options.timeoutMs,
    })
  })

  it('rethrows existing AppError from request path without remapping', async () => {
    const requestMock = makeRequestMock()
    const appError = AppError.create({
      code: ERROR_CODES.EXTERNAL_SERVICE_ERROR,
      message: 'errors.external_service_error',
      status: STATUS_CODES.BAD_REQUEST,
      name: 'AxiosHttpClientException',
      cause: undefined,
    })
    requestMock.mockRejectedValue(appError)

    const client = new AxiosHttpClient(makeClient(requestMock))

    await expect(client.get('/users', undefined)).rejects.toBe(appError)
  })
})

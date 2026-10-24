import { Guards, type IFactory, type IHttpClient } from '@xeno-js/shared'
import type { CreateAxiosDefaults, InternalAxiosRequestConfig } from 'axios'
import axios from 'axios'

import type { AxiosConfig } from '../config/axios.config'
import { AxiosHttpClient } from '../services/http'

export class NodeAxiosFactory implements IFactory<AxiosConfig, IHttpClient> {
  public create(config: AxiosConfig): IHttpClient {
    const { interceptors, xsrfCookieName, xsrfHeaderName, ctxAccessor, ...axiosDefaults } = config
    
    const defaults: AxiosConfig = {
      baseURL: 'http://localhost:3000',
      timeout: 10000,
      maxContentLength: 10 * 1024 * 1024,
      maxBodyLength: 10 * 1024 * 1024,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    }

    const mergedConfig: CreateAxiosDefaults = {
      ...defaults,
      ...axiosDefaults,
      headers: {
        ...defaults.headers,
        ...(axiosDefaults.headers ?? {}),
      },
    }

    const axiosInstance = axios.create(mergedConfig)

    axiosInstance.interceptors.request.use((requestConfig: InternalAxiosRequestConfig) => {
      if (Guards.isDefined(ctxAccessor)) {
        const ctx = ctxAccessor()
        if (Guards.isDefined(ctx)) {
          if (Guards.isDefined(ctx)) {
            if (Guards.isDefined(ctx.tracing?.correlationId)) {
              requestConfig.headers['x-correlation-id'] = ctx.tracing.correlationId
            }
            if (Guards.isDefined(ctx.tracing?.spanId)) {
              requestConfig.headers['x-span-id'] = ctx.tracing.spanId
            }
            if (Guards.isDefined(ctx.tracing?.parentSpanId)) {
              requestConfig.headers['x-parent-span-id'] = ctx.tracing.parentSpanId
            }

            if (Guards.isDefined(ctx.network?.requestId)) {
              requestConfig.headers['x-request-id'] = ctx.network.requestId
            }
            if (Guards.isDefined(ctx.network?.clientIp)) {
              requestConfig.headers['x-forwarded-for'] = ctx.network.clientIp
            }

            if (Guards.isDefined(ctx.messaging)) {
              if (Guards.isDefined(ctx.messaging.returnAddress)) {
                requestConfig.headers['x-return-address'] = ctx.messaging.returnAddress
              }
              if (Guards.isDefined(ctx.messaging.expiration)) {
                requestConfig.headers['x-expiration'] = String(ctx.messaging.expiration)
              }
              if (Guards.isDefined(ctx.messaging.sequence)) {
                if (Guards.isDefined(ctx.messaging.sequence.sequenceId)) {
                  requestConfig.headers['x-sequence-id'] = ctx.messaging.sequence.sequenceId
                }
                if (Guards.isDefined(ctx.messaging.sequence.position)) {
                  requestConfig.headers['x-sequence-position'] = String(ctx.messaging.sequence.position)
                }
                if (Guards.isDefined(ctx.messaging.sequence.size)) {
                  requestConfig.headers['x-sequence-size'] = String(ctx.messaging.sequence.size)
                }
              }
            }
          }
        }
      }

      if (Guards.isDefined(xsrfCookieName) && Guards.isDefined(xsrfHeaderName)) {
        if (typeof document !== 'undefined') {
          const regex = new RegExp(`(^| )${xsrfCookieName}=([^;]+)`)
          const match = regex.exec(document.cookie)
          if (Guards.isDefined(match) && Guards.isDefined(match[2])) {
            requestConfig.headers[xsrfHeaderName] = decodeURIComponent(match[2])
          }
        }
      }

      return requestConfig
    })

    if (!Guards.isNullOrEmpty(interceptors?.request)) {
      for (const reqInterceptor of interceptors.request) {
        axiosInstance.interceptors.request.use(
          reqInterceptor.onFulfilled,
          reqInterceptor.onRejected
        )
      }
    }

    if (!Guards.isNullOrEmpty(interceptors?.response)) {
      for (const resInterceptor of interceptors.response) {
        axiosInstance.interceptors.response.use(
          resInterceptor.onFulfilled,
          resInterceptor.onRejected
        )
      }
    }

    return new AxiosHttpClient(axiosInstance)
  }
}

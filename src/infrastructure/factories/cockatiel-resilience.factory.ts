import type { IFactory, IServiceResilience } from '@xeno-js/shared'
import { AppError, Guards, RESILIENCE_DEFAULTS, STATUS_CODES } from '@xeno-js/shared'
import {
  bulkhead,
  circuitBreaker,
  ConsecutiveBreaker,
  ExponentialBackoff,
  handleWhen,
  retry,
  wrap,
} from 'cockatiel'

import type { ResiliencePolicy } from '../config/resilince.config'
import { ServiceResilience } from '../services/resilience/resilience.service'

interface HttpErrorLike {
  code?: string
  status?: number
  config?: {
    method?: string
  }
}

/**
 * @description Factory class responsible for creating instances of ServiceResilience based on the provided configuration. It implements the IFactory interface, allowing for easy integration with dependency injection systems. The factory encapsulates the creation logic for the ServiceResilience, including the initialization of the underlying resilience policies with the specified configuration options such as retry, circuit breaker, and bulkhead. This design promotes separation of concerns and allows for flexibility in managing ServiceResilience instances across the application.
 *
 * @author Xeno
 * @version 1.0.0
 * @since 2025-09-30
 * @link https://github.com/xeno-js/xeno-js
 */
export class CockatielResilienceFactory implements IFactory<ResiliencePolicy, IServiceResilience> {
  public create(options: ResiliencePolicy): IServiceResilience {
    const bulkheadPolicy = bulkhead(options.bulkhead?.limit ?? 10, options.bulkhead?.queue ?? 10)
    const circuitBreakerPolicy = circuitBreaker(handleWhen((error: unknown) => this.isTransientError(error)), {
      breaker: new ConsecutiveBreaker(options.circuitBreaker?.threshold ?? RESILIENCE_DEFAULTS.CIRCUIT_BREAKER.CONSECUTIVE_FAILURES),
      halfOpenAfter: options.circuitBreaker?.halfOpenAfter ?? RESILIENCE_DEFAULTS.CIRCUIT_BREAKER.HALF_OPEN_TIMEOUT_MS,
    })

    const retryPolicy = retry(
      handleWhen((error: unknown) => this.isTransientAndIdempotent(error)), {
      maxAttempts: options.retry?.maxAttempts ?? RESILIENCE_DEFAULTS.RETRY.ATTEMPTS,
      backoff: new ExponentialBackoff({
        initialDelay: options.retry?.backoff?.initialDelay ?? RESILIENCE_DEFAULTS.RETRY.BASE_DELAY_MS,
        maxDelay: options.retry?.backoff?.maxDelay ?? RESILIENCE_DEFAULTS.RETRY.MAX_DELAY_MS
      }),
    })

    return new ServiceResilience(wrap(bulkheadPolicy, circuitBreakerPolicy, retryPolicy))
  }

  private isTransientError(error: unknown): boolean {
    if (!Guards.isDefined(error) || !Guards.isObject(error)) return false
    const networkError = [
      'ECONNABORTED',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ECONNREFUSED',
    ]

    const checkIsTransientError = (status: number, code: string) => status === STATUS_CODES.REQUEST_TIMEOUT || (status > STATUS_CODES.INTERNAL_SERVER_ERROR || status > 600) || networkError.includes(code)

    if (error instanceof AppError)
      return checkIsTransientError(error.status, error.code)
    else {
      const err = error as { status: number, code: string }
      return checkIsTransientError(Guards.isNumber(err.status) ? err.status : 0, Guards.isString(err.code) ? err.code : '')
    }
  }

  private isTransientAndIdempotent(error: unknown): boolean {
    if (!this.isTransientError(error)) return false

    const idempotentMethods = ['GET', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']
    const checkIsTransientAndIdempotentError = (method?: string) => {
      if (Guards.isNullOrEmpty(method)) return false
      return idempotentMethods.includes(method.toUpperCase())
    }

    if (error instanceof AppError) {
      const cause = error.cause as HttpErrorLike
      if (Guards.isDefined(cause) && Guards.isDefined(cause.config) && Guards.isString(cause.config.method))
        return checkIsTransientAndIdempotentError(cause.config.method)
    } else {
      const err = error as HttpErrorLike
      if (Guards.isDefined(err) && Guards.isDefined(err.config) && Guards.isString(err.config.method))
        return checkIsTransientAndIdempotentError(err.config.method)
    }
    return false
  }
}

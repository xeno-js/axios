import type { IServiceResilience, Optional } from '@xeno-js/shared'
import { AppError } from '@xeno-js/shared'
import type { IPolicy } from 'cockatiel'

/**
 * @description The ServiceResilience class implements the IServiceResilience interface, providing a concrete implementation of resilience features for service calls. This class is designed to enhance the reliability of service interactions by automatically handling transient faults and preventing cascading failures in distributed systems. The execute method allows for the execution of asynchronous operations with built-in support for retries, timeouts, and circuit breakers, ensuring that service calls are more resilient to failures and can recover gracefully from errors.
   * 
   * @author Xeno
   * @version 1.0.0
   * @since 2025-09-30
   * @link https://github.com/xeno-js/xeno-js 
   */
export class ServiceResilience implements IServiceResilience {
  constructor(private readonly policy: IPolicy) {}

  public async execute<T>(operation: () => Promise<T>, signal: Optional<AbortSignal>): Promise<T> {
    AppError.throwIfAborted(signal, 'ServiceResilience.execute')

    return this.policy.execute(() => operation(), signal)
  }
}

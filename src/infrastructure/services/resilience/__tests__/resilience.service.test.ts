import { AppError } from '@xeno-js/core'
import type { IPolicy } from 'cockatiel'
import { describe, expect, it, vi } from 'vitest'

import { ServiceResilience } from '../resilience.service'

describe('ServiceResilience', () => {
  it('executes the operation through policy and returns its result', async () => {
    const signal = new AbortController().signal
    const operation = vi.fn().mockResolvedValue('ok')
    const executeMock = vi.fn(async (handler: () => Promise<string>) => handler())
    const policy = { execute: executeMock } as unknown as IPolicy

    const service = new ServiceResilience(policy)
    const result = await service.execute(operation, signal)

    expect(result).toBe('ok')
    expect(operation).toHaveBeenCalledOnce()
    expect(executeMock).toHaveBeenCalledOnce()
    expect(executeMock).toHaveBeenCalledWith(expect.any(Function), signal)
  })

  it('throws AppError when signal is already aborted and does not call policy', async () => {
    const controller = new AbortController()
    controller.abort()

    const executeMock = vi.fn()
    const policy = { execute: executeMock } as unknown as IPolicy

    const service = new ServiceResilience(policy)
    const execution = service.execute(async () => 'never', controller.signal)

    await expect(execution).rejects.toBeInstanceOf(AppError)
    await expect(execution).rejects.toMatchObject({ name: 'ServiceResilience.execute' })
    expect(executeMock).not.toHaveBeenCalled()
  })

  it('propagates operation errors returned by policy execution', async () => {
    const failure = new Error('boom')
    const operation = vi.fn().mockRejectedValue(failure)
    const executeMock = vi.fn(async (handler: () => Promise<never>) => handler())
    const policy = { execute: executeMock } as unknown as IPolicy

    const service = new ServiceResilience(policy)

    await expect(service.execute(operation, undefined)).rejects.toThrow('boom')
    expect(operation).toHaveBeenCalledOnce()
  })

  it('checks abort status with the expected context name', async () => {
    const throwIfAbortedSpy = vi.spyOn(AppError, 'throwIfAborted')
    const executeMock = vi.fn(async (handler: () => Promise<string>) => handler())
    const policy = { execute: executeMock } as unknown as IPolicy

    const service = new ServiceResilience(policy)

    await service.execute(async () => 'ok', undefined)

    expect(throwIfAbortedSpy).toHaveBeenCalledWith(undefined, 'ServiceResilience.execute')

    throwIfAbortedSpy.mockRestore()
  })
})

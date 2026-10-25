<div align="center">
  <img src="logo/logo.png" alt="Xeno.JS Logo" width="140" />

  <h1>Xeno.JS Axios</h1>
  <p><strong>A Typescript application framework architecture for Node.js, designed for lower technical debt, and faster infrastructure migrations.</strong></p>
  <p>Build long-lived applications with explicit dependency injection, DDD, CQRS, and transport-independent business logic.</p>

  <p>
    <a href="https://www.npmjs.com/package/@xeno-js/axios"><img src="https://img.shields.io/npm/v/@xeno-js/core?style=flat-square" alt="NPM Version" /></a>
    <a href="https://github.com/xeno-js/axios"><img src="https://img.shields.io/badge/Powered%20by-Xeno-blueviolet?style=flat-square" alt="Powered by Xeno" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License: MIT" /></a>
    <a href="https://buymeacoffee.com/xenojs">
      <img src="https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Support-FFdd00?style=flat-square&logo=buy-me-a-coffee&logoColor=black" alt="Buy Me A Coffee" />
    </a>
  </p>
</div>

---

`@xeno-js/axios` provides integration with Axios within the Xeno.JS ecosystem.
It handles outbound HTTP requests, automatic injection of tracing headers, and
resilience policies via the Cockatiel library.

## Installation

```bash
npm install @xeno-js/axios axios cockatiel

```

The package requires `@xeno-js/core` as a peer dependency.

---

## 1. HTTP Plugin Configuration and Axios Client

**Problem.** Distributed applications require a centrally configured outbound
HTTP client capable of automatically propagating tracing contexts (correlation
ID, request ID) and managing XSRF tokens.

**Principle.** HTTP client configuration must be declarative, isolated, and
integrated into the application builder via dedicated plugins.

**Mechanism.** The `withAxiosHttp` function defines an `http` type plugin that
leverages `NodeAxiosFactory` to create Axios instances configured with
interceptors for propagating the execution context (`RequestContext`).

**Implementation:**

```ts
// src/registry.ts
import type { IHandler, IPaginatedResult, XenoRegistry } from '@xeno-js/core'
import type { GetProductsQuery, ProductDto } from './products'

export interface MyRegistry extends XenoRegistry {
  GET_PRODUCTS: IHandler<GetProductsQuery, IPaginatedResult<ProductDto>>
}

// src/bootstrap.ts
import { XenoAppBuilder } from '@xeno-js/core'
import { withAxiosHttp } from '@xeno-js/axios'
import { GetProductsHandler } from './products'
import { MyRegistry } from './registry'

const app = await new XenoAppBuilder<MyRegistry>()
  .addHttpClients(
    withAxiosHttp((clients) => {
      clients.push({
        name: 'ApiClient',
        axios: {
          baseURL: 'https://api.example.com',
          timeout: 5000,
        },
      })
    }),
  )
  .addServices((opts) => {
    opts.addScoped(
      'GET_PRODUCTS',
      (c) =>
        new GetProductsHandler(
          c.resolve('httpClientFactory').get('ApiClient'),
          c.resolve('userContextFactory'),
        ),
    )
  })
  .build()

// src/products/application/handlers/get-products.handler.ts
import {
  BaseHandler,
  type IRemoteDataSource,
  type UserContext,
  type IFactory,
  type ApiResponseDto,
  Result,
  AppError,
  type IPaginatedResult,
} from '@xeno-js/core'

import type { GetProductsQuery } from '../query'
import type { ProductDto } from '../../infrastructure'

export class GetProductsHandler extends BaseHandler<
  GetProductsQuery,
  IPaginatedResult<ProductDto>
> {
  constructor(
    private readonly _apiClient: IRemoteDataSource,
    identityFactory: IFactory<void, UserContext>,
  ) {
    super(identityFactory)
  }

  async executeAsync(query: GetProductsQuery, signal: AbortSignal) {
    const result = await this._apiClient.get<
      ApiResponseDto<IPaginatedResult<ProductDto>>
    >('/v1/products', {
      query: { page: query.page, pageSize: query.pageSize },
      signal,
    })

    if (!result.isOk())
      return Result.fail<IPaginatedResult<ProductDto>, AppError>(
        result.getErrorOrThrow(),
      )

    const responseData = result.getValueOrThrow() as {
      data: IPaginatedResult<ProductDto>
    }
    return Result.ok(responseData.data)
  }
}
```

**Behavior:** During the request, the interceptor automatically injects tracing
headers (`x-correlation-id`, `x-request-id`, `x-span-id`, etc.) into the headers
by retrieving them from `AsyncLocalStorage` via the active context.

**Boundary:** This package exclusively manages the outbound HTTP client and
associated resilience, delegating the reception and routing of server-side HTTP
requests to dedicated transport adapters (e.g., Fastify or Node HTTP).

---

## 2. Resilience Policies (Cockatiel)

**Problem.** Network calls to external services are subject to transient
failures, timeouts, or overloads that can cause cascading failures in the
architecture.

**Principle.** Network calls must be protected by automatic retry, circuit
breaker, and bulkhead mechanisms to ensure error tolerance.

**Mechanism:** `CockatielResilienceFactory` encapsulates the Cockatiel library
to apply wrapped policies (`wrap`), handling selective transient failures based
on idempotent HTTP methods and returned error codes.

**Implementation:**

Resilience policies can be configured directly in the client definition within
the plugin:

```ts
withAxiosHttp((clients) => {
  clients.push({
    name: 'ResilientClient',
    axios: { baseURL: 'https://api.example.com' },
    resilience: {
      retry: { maxAttempts: 3 },
      circuitBreaker: { threshold: 5, halfOpenAfter: 10000 },
      bulkhead: { limit: 10, queue: 10 },
    },
  })
})
```

**Behavior:** If a call fails due to a transient error (e.g., timeout or
eligible server-side error codes), the policy steps in by performing incremental
attempts (exponential backoff) or opening the circuit if the consecutive failure
threshold is exceeded.

**Boundary:** Resilience policies apply solely to operations executed via the
configured client, without altering the internal logic of business handlers.

---

## License

Released under the MIT [License](LICENSE).

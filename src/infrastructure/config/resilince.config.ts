export interface ResiliencePolicy {
    bulkhead?: {
        limit: number
        queue?: number
    }
    circuitBreaker?: {
        threshold?: number
        halfOpenAfter?: number
    }
    retry?: {
        maxAttempts?: number
        backoff?: {
            initialDelay?: number
            maxDelay?: number
        }
    }
}
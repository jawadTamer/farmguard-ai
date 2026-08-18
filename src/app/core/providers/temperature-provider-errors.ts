/**
 * Temperature Provider Error Types
 * 
 * Custom error types for handling different failure scenarios in temperature providers.
 */

export class TemperatureProviderError extends Error {
  constructor(
    message: string,
    public readonly providerName: string,
    public readonly originalError?: any
  ) {
    super(message);
    this.name = 'TemperatureProviderError';
  }
}

export class ApiKeyMissingError extends TemperatureProviderError {
  constructor(providerName: string) {
    super(
      'API key is not configured. Please set FORTYGUARD_API_KEY in Edge Function environment variables.',
      providerName
    );
    this.name = 'ApiKeyMissingError';
  }
}

export class InvalidApiKeyError extends TemperatureProviderError {
  constructor(providerName: string) {
    super(
      'Invalid API key. Please verify the FORTYGUARD_API_KEY configuration.',
      providerName
    );
    this.name = 'InvalidApiKeyError';
  }
}

export class NetworkError extends TemperatureProviderError {
  constructor(providerName: string, originalError?: any) {
    super(
      'Network error occurred while communicating with the API.',
      providerName,
      originalError
    );
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends TemperatureProviderError {
  constructor(providerName: string) {
    super(
      'Request timed out. Please try again.',
      providerName
    );
    this.name = 'TimeoutError';
  }
}

export class RateLimitError extends TemperatureProviderError {
  constructor(providerName: string, public readonly retryAfter?: number) {
    super(
      'Rate limit exceeded. Please retry later.',
      providerName
    );
    this.name = 'RateLimitError';
  }
}

export class InvalidCoordinatesError extends TemperatureProviderError {
  constructor(providerName: string) {
    super(
      'Invalid coordinates provided. Please check farm/zone location data.',
      providerName
    );
    this.name = 'InvalidCoordinatesError';
  }
}

export class EmptyResponseError extends TemperatureProviderError {
  constructor(providerName: string) {
    super(
      'API returned empty response. No data available.',
      providerName
    );
    this.name = 'EmptyResponseError';
  }
}

export class ValidationError extends TemperatureProviderError {
  constructor(providerName: string, public readonly validationErrors: string[]) {
    super(
      `Response validation failed: ${validationErrors.join(', ')}`,
      providerName
    );
    this.name = 'ValidationError';
  }
}

/**
 * Error handler utility for temperature providers
 */
export class TemperatureProviderErrorHandler {
  /**
   * Handle provider errors with appropriate fallback strategy
   */
  static handleError(error: any, providerName: string): TemperatureProviderError {
    // If already a TemperatureProviderError, return as-is
    if (error instanceof TemperatureProviderError) {
      return error;
    }

    // Map common error types
    if (error?.message?.includes('API key') || error?.message?.includes('FORTYGUARD_API_KEY')) {
      return new ApiKeyMissingError(providerName);
    }

    if (error?.message?.includes('401') || error?.message?.includes('403')) {
      return new InvalidApiKeyError(providerName);
    }

    if (error?.message?.includes('timeout') || error?.code === 'ETIMEDOUT') {
      return new TimeoutError(providerName);
    }

    if (error?.message?.includes('429') || error?.status === 429) {
      return new RateLimitError(providerName, error?.retryAfter);
    }

    if (error?.message?.includes('network') || error?.code === 'ENOTFOUND' || error?.code === 'ECONNREFUSED') {
      return new NetworkError(providerName, error);
    }

    // Default to generic provider error
    return new TemperatureProviderError(
      error?.message || 'Unknown error occurred',
      providerName,
      error
    );
  }

  /**
   * Check if error is recoverable (should retry with fallback)
   */
  static isRecoverable(error: TemperatureProviderError): boolean {
    return (
      error instanceof NetworkError ||
      error instanceof TimeoutError ||
      error instanceof RateLimitError ||
      error instanceof EmptyResponseError
    );
  }

  /**
   * Check if error is configuration-related (requires admin action)
   */
  static isConfigurationError(error: TemperatureProviderError): boolean {
    return (
      error instanceof ApiKeyMissingError ||
      error instanceof InvalidApiKeyError
    );
  }

  /**
   * Check if error is data-related (requires data fix)
   */
  static isDataError(error: TemperatureProviderError): boolean {
    return (
      error instanceof InvalidCoordinatesError ||
      error instanceof ValidationError
    );
  }

  /**
   * Get user-friendly error message
   */
  static getUserMessage(error: TemperatureProviderError): string {
    if (error instanceof ApiKeyMissingError) {
      return 'Temperature service is not configured. Please contact your administrator.';
    }

    if (error instanceof InvalidApiKeyError) {
      return 'Temperature service authentication failed. Please contact your administrator.';
    }

    if (error instanceof NetworkError) {
      return 'Unable to connect to temperature service. Using cached data.';
    }

    if (error instanceof TimeoutError) {
      return 'Temperature service request timed out. Using cached data.';
    }

    if (error instanceof RateLimitError) {
      return 'Temperature service rate limit reached. Using cached data.';
    }

    if (error instanceof InvalidCoordinatesError) {
      return 'Farm/zone location data is invalid. Please update location information.';
    }

    if (error instanceof EmptyResponseError) {
      return 'No temperature data available. Using cached data.';
    }

    if (error instanceof ValidationError) {
      return 'Temperature data format error. Using cached data.';
    }

    return 'Temperature service unavailable. Using cached data.';
  }
}

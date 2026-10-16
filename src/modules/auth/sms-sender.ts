import { AppError } from '../../shared/errors.ts';

export interface SmsSender {
  sendOtp(phone: string, code: string): Promise<void>;
}

export class SmsProviderError extends AppError {
  constructor() {
    super(502, 'SMS provider failed');
    this.name = 'SmsProviderError';
  }
}

type Log = (message: string) => void;

/** Development sender: prints the code instead of sending an SMS. */
export class ConsoleSmsSender implements SmsSender {
  constructor(private readonly log: Log = console.log) {}

  async sendOtp(phone: string, code: string): Promise<void> {
    this.log(`[sms:console] OTP for ${phone}: ${code}`);
  }
}

export interface KavenegarOptions {
  apiKey: string;
  template: string;
  fetch?: typeof fetch;
  logError?: Log;
  timeoutMs?: number;
}

interface KavenegarResponse {
  return?: { status?: number; message?: string };
}

/** Sends the code with Kavenegar's verify/lookup API (https://kavenegar.com/rest.html). */
export class KavenegarSmsSender implements SmsSender {
  private readonly fetch: typeof fetch;
  private readonly logError: Log;

  constructor(private readonly options: KavenegarOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.logError = options.logError ?? console.error;
  }

  async sendOtp(phone: string, code: string): Promise<void> {
    const { apiKey, template, timeoutMs = 10_000 } = this.options;
    const query = new URLSearchParams({ receptor: phone, token: code, template });
    const url = `https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/verify/lookup.json?${query}`;

    let result: KavenegarResponse['return'];
    try {
      const response = await this.fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      result = ((await response.json()) as KavenegarResponse).return;
    } catch (error) {
      // Never log the URL: it contains the API key.
      this.logError(
        `Kavenegar request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new SmsProviderError();
    }

    if (result?.status !== 200) {
      this.logError(
        `Kavenegar verify/lookup failed: status=${result?.status} message=${result?.message}`,
      );
      throw new SmsProviderError();
    }
  }
}

export interface SmsConfig {
  SMS_PROVIDER: 'console' | 'kavenegar';
  KAVENEGAR_API_KEY: string;
  KAVENEGAR_OTP_TEMPLATE: string;
}

export function createSmsSender(config: SmsConfig): SmsSender {
  return config.SMS_PROVIDER === 'kavenegar'
    ? new KavenegarSmsSender({
        apiKey: config.KAVENEGAR_API_KEY,
        template: config.KAVENEGAR_OTP_TEMPLATE,
      })
    : new ConsoleSmsSender();
}

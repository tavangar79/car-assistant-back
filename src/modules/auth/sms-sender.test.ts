import { describe, expect, it, vi } from 'vitest';
import { ConsoleSmsSender, KavenegarSmsSender, SmsProviderError } from './sms-sender.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createSender(fetchImpl: typeof fetch) {
  const logError = vi.fn<(message: string) => void>();
  const sender = new KavenegarSmsSender({
    apiKey: 'SECRET-KEY',
    template: 'otp-template',
    fetch: fetchImpl,
    logError,
  });
  return { sender, logError };
}

describe('KavenegarSmsSender', () => {
  it('calls verify/lookup with the receptor, token and template', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ return: { status: 200, message: 'تایید شد' }, entries: [] }),
      );
    const { sender } = createSender(fetchMock);

    await sender.sendOtp('09121234567', '12345');

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe(
      'https://api.kavenegar.com/v1/SECRET-KEY/verify/lookup.json',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      receptor: '09121234567',
      token: '12345',
      template: 'otp-template',
    });
  });

  it('throws SmsProviderError and logs the Kavenegar status without the key', async () => {
    const { sender, logError } = createSender(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({ return: { status: 418, message: 'credit' } }, 418)),
    );

    await expect(sender.sendOtp('09121234567', '12345')).rejects.toBeInstanceOf(SmsProviderError);

    const logged = logError.mock.calls[0]?.[0] ?? '';
    expect(logged).toContain('status=418');
    expect(logged).not.toContain('SECRET-KEY');
  });

  it('throws SmsProviderError on a network error', async () => {
    const { sender, logError } = createSender(
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed')),
    );

    const error = await sender.sendOtp('09121234567', '12345').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SmsProviderError);
    expect(error).toMatchObject({ statusCode: 502, message: 'SMS provider failed' });
    expect(logError).toHaveBeenCalledOnce();
  });

  it('throws SmsProviderError when the response is not JSON', async () => {
    const { sender } = createSender(
      vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>', { status: 500 })),
    );

    await expect(sender.sendOtp('09121234567', '12345')).rejects.toBeInstanceOf(SmsProviderError);
  });
});

describe('ConsoleSmsSender', () => {
  it('logs the code', async () => {
    const log = vi.fn<(message: string) => void>();

    await new ConsoleSmsSender(log).sendOtp('09121234567', '12345');

    expect(log).toHaveBeenCalledWith(expect.stringContaining('12345'));
  });
});

import { describe, expect, it } from 'vitest';
import { JWT_SECRET_PLACEHOLDER, loadEnv } from './env.ts';

const base = {
  DATABASE_URL: 'mongodb://localhost:27017/test',
  JWT_SECRET: 'a'.repeat(32),
};

const production = {
  ...base,
  NODE_ENV: 'production',
  SMS_PROVIDER: 'kavenegar',
  KAVENEGAR_API_KEY: 'k',
  KAVENEGAR_OTP_TEMPLATE: 't',
};

describe('loadEnv', () => {
  it('applies auth defaults', () => {
    const env = loadEnv(base);

    expect(env).toMatchObject({
      JWT_EXPIRES_IN: '30d',
      SMS_PROVIDER: 'console',
      OTP_LENGTH: 5,
      OTP_TTL_SECONDS: 120,
      OTP_RESEND_COOLDOWN_SECONDS: 60,
      OTP_MAX_ATTEMPTS: 5,
      OTP_MAX_REQUESTS_PER_WINDOW: 5,
      OTP_REQUEST_WINDOW_SECONDS: 3600,
      AUTH_IP_RATE_LIMIT_MAX: 30,
      AUTH_IP_RATE_LIMIT_WINDOW_SECONDS: 900,
      TRUST_PROXY_HOPS: 0,
    });
    expect(env.OTP_FIXED_CODE).toBeUndefined();
  });

  it('rejects a JWT_EXPIRES_IN without a unit', () => {
    expect(() => loadEnv({ ...base, JWT_EXPIRES_IN: '3600' })).toThrow(/JWT_EXPIRES_IN/);
  });

  it('rejects a short JWT_SECRET', () => {
    expect(() => loadEnv({ ...base, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('rejects the .env.example JWT_SECRET placeholder', () => {
    expect(() => loadEnv({ ...base, JWT_SECRET: JWT_SECRET_PLACEHOLDER })).toThrow(
      /JWT_SECRET.*placeholder/s,
    );
  });

  it('requires Kavenegar settings only when SMS_PROVIDER=kavenegar', () => {
    expect(() => loadEnv({ ...base, SMS_PROVIDER: 'kavenegar' })).toThrow(/KAVENEGAR_API_KEY/);
    expect(
      loadEnv({
        ...base,
        SMS_PROVIDER: 'kavenegar',
        KAVENEGAR_API_KEY: 'k',
        KAVENEGAR_OTP_TEMPLATE: 't',
      }),
    ).toMatchObject({ SMS_PROVIDER: 'kavenegar' });
  });

  describe('OTP_FIXED_CODE', () => {
    it('treats an empty value as unset', () => {
      expect(loadEnv({ ...base, OTP_FIXED_CODE: '' }).OTP_FIXED_CODE).toBeUndefined();
    });

    it('accepts a fixed code of OTP_LENGTH digits outside production', () => {
      expect(loadEnv({ ...base, OTP_FIXED_CODE: '12345' }).OTP_FIXED_CODE).toBe('12345');
    });

    it.each(['1234', '123456', '12a45'])('rejects %s when OTP_LENGTH=5', (code) => {
      expect(() => loadEnv({ ...base, OTP_FIXED_CODE: code })).toThrow(/OTP_FIXED_CODE/);
    });

    it('refuses to boot with a fixed code in production', () => {
      expect(() => loadEnv({ ...production, OTP_FIXED_CODE: '12345' })).toThrow(
        /OTP_FIXED_CODE.*production/s,
      );
    });
  });

  it('refuses to boot with SMS_PROVIDER=console in production', () => {
    expect(() => loadEnv({ ...production, SMS_PROVIDER: 'console' })).toThrow(
      /SMS_PROVIDER.*production/s,
    );
  });

  it('boots in production with kavenegar and no fixed code', () => {
    expect(loadEnv(production)).toMatchObject({ NODE_ENV: 'production' });
  });

  it('rejects a request window shorter than the resend cooldown', () => {
    expect(() =>
      loadEnv({ ...base, OTP_REQUEST_WINDOW_SECONDS: '30', OTP_RESEND_COOLDOWN_SECONDS: '60' }),
    ).toThrow(/OTP_REQUEST_WINDOW_SECONDS/);
  });
});

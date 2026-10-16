import { SmsProviderError, type SmsSender } from '../modules/auth/sms-sender.ts';

/** Records sent codes; set `fail = true` to simulate a provider outage. */
export class FakeSmsSender implements SmsSender {
  readonly sent: { phone: string; code: string }[] = [];
  fail = false;

  async sendOtp(phone: string, code: string): Promise<void> {
    if (this.fail) throw new SmsProviderError();
    this.sent.push({ phone, code });
  }
}

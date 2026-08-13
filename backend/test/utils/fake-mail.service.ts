import { Injectable } from '@nestjs/common';

@Injectable()
export class FakeMailService {
  sent: Array<{ to: string; resetUrl: string }> = [];

  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    this.sent.push({ to, resetUrl });
  }
}

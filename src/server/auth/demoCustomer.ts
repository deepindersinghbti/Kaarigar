import { timingSafeEqual } from 'node:crypto';

// A demo identifier, not a routable Indian mobile number. Never send SMS here.
export const DEMO_CUSTOMER_PHONE = '+910123456789';
export const DEMO_CUSTOMER_NAME = 'Neha Sharma';

export function demoCustomerEnabled(): boolean {
  return process.env.DEMO_OTP_ENABLED?.trim().toLowerCase() === 'true'
    && /^\d{6}$/.test(process.env.DEMO_CUSTOMER_OTP_CODE?.trim() ?? '')
    && process.env.DEMO_CUSTOMER_OTP_CODE?.trim() !== process.env.DEMO_OTP_CODE?.trim();
}

export function demoCustomerAccepts(phone: string, code: string): boolean {
  if (phone !== DEMO_CUSTOMER_PHONE || !demoCustomerEnabled() || !/^\d{6}$/.test(code)) return false;
  return timingSafeEqual(Buffer.from(code), Buffer.from(process.env.DEMO_CUSTOMER_OTP_CODE!.trim()));
}

import { sendViaSmsGateway } from "@/lib/sms-gateway";
import { sendViaTwilio } from "@/lib/twilio-sms";

export type SendBookingSmsResult = {
  provider: "sms-gateway" | "twilio";
  id?: string;
};

export async function sendBookingSms(params: {
  phoneE164: string;
  body: string;
}): Promise<SendBookingSmsResult | void> {
  const { phoneE164, body } = params;
  const gatewayUrl = process.env.SMS_GATEWAY_URL?.trim();
  const gatewayKey = process.env.SMS_GATEWAY_API_KEY?.trim();

  if (gatewayUrl && gatewayKey) {
    try {
      const id = await sendViaSmsGateway(phoneE164, body);
      console.log(`SMS sent via sms-gateway job=${id}`);
      return { provider: "sms-gateway", id };
    } catch (error: unknown) {
      const reason =
        error instanceof Error ? error.message : String(error);
      console.warn("[sms] SMS gateway failed, falling back to Twilio:", reason);
    }
  }

  const { sid } = await sendViaTwilio(phoneE164, body);
  if (!sid) {
    return;
  }
  console.log(`SMS sent via twilio sid=${sid}`);
  return { provider: "twilio", id: sid };
}

import { sendViaWebSms } from "@/lib/websms-sms";

export type SendBookingSmsResult = {
  provider: "websms";
  id?: string;
};

/** Sends order/customer SMS via WebSMS (websms.com.cy / api.websms.com). */
export async function sendBookingSms(params: {
  phoneE164: string;
  body: string;
}): Promise<SendBookingSmsResult | void> {
  const { phoneE164, body } = params;
  const { transferId, clientMessageId } = await sendViaWebSms(phoneE164, body);
  const id = transferId ?? clientMessageId;
  if (!id) {
    return;
  }
  console.log(`SMS sent via websms id=${id}`);
  return { provider: "websms", id };
}

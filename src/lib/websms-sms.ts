const WEBSMS_TIMEOUT_MS = 30_000;
const DEFAULT_GATEWAY_URL = "https://api.websms.com";
const SEND_PATH = "/rest/smsmessaging/simple";
const SUCCESS_STATUS_CODES = new Set([2000, 2001, 2002]);

type WebSmsSendResponse = {
  statusCode?: number;
  statusMessage?: string;
  transferId?: string;
  clientMessageId?: string;
};

function gatewayBaseUrl(): string {
  const raw = process.env.WEBSMS_GATEWAY_URL?.trim();
  return (raw || DEFAULT_GATEWAY_URL).replace(/\/+$/, "");
}

function apiKey(): string | undefined {
  return process.env.WEBSMS_API_KEY?.trim();
}

function senderId(): string | undefined {
  return process.env.WEBSMS_SENDER_ID?.trim();
}

function maxSmsPerMessage(): number {
  const raw = process.env.WEBSMS_MAX_SMS_PER_MESSAGE?.trim();
  if (!raw) {
    return 3;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 255) {
    throw new Error("WEBSMS_MAX_SMS_PER_MESSAGE must be an integer between 1 and 255");
  }
  return parsed;
}

function isTestMode(): boolean {
  return process.env.WEBSMS_TEST?.trim().toLowerCase() === "true";
}

/** E.164 (+35799123456) → international MSISDN digits (35799123456). */
export function toWebSmsRecipient(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, "");
  if (!/^\d{7,15}$/.test(digits)) {
    throw new Error(`Invalid phone number for WebSMS: ${phoneE164}`);
  }
  return digits;
}

export async function sendViaWebSms(
  toNumber: string,
  message: string,
): Promise<{ transferId?: string; clientMessageId?: string }> {
  const params = { phoneE164: toNumber, body: message };
  const key = apiKey();
  const sender = senderId();

  if (!key) {
    console.log("SMS (dev fallback, WEBSMS_API_KEY not set):", params);
    return {};
  }

  if (!sender) {
    console.log("SMS (dev fallback, WEBSMS_SENDER_ID not set):", params);
    return {};
  }

  const recipient = toWebSmsRecipient(toNumber);
  const url = `${gatewayBaseUrl()}${SEND_PATH}`;
  const body = {
    recipientAddressList: [recipient],
    messageContent: message,
    senderAddress: sender,
    senderAddressType: "alphanumeric",
    maxSmsPerMessage: maxSmsPerMessage(),
    test: isTestMode(),
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(WEBSMS_TIMEOUT_MS),
    });
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`WebSMS request failed: ${reason}`);
  }

  let payload: WebSmsSendResponse | undefined;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      payload = (await response.json()) as WebSmsSendResponse;
    } catch {
      payload = undefined;
    }
  } else {
    try {
      await response.text();
    } catch {
      /* ignore */
    }
  }

  if (response.status === 401) {
    throw new Error("WebSMS authentication failed. Check WEBSMS_API_KEY.");
  }

  if (!response.ok) {
    const detail =
      payload?.statusMessage ??
      (payload?.statusCode != null ? `statusCode=${payload.statusCode}` : "");
    const suffix = detail ? `: ${detail}` : "";
    throw new Error(`WebSMS HTTP ${response.status}${suffix}`);
  }

  const statusCode = payload?.statusCode;
  if (statusCode == null) {
    throw new Error("WebSMS response missing statusCode");
  }

  if (!SUCCESS_STATUS_CODES.has(statusCode)) {
    const detail = payload?.statusMessage ? `: ${payload.statusMessage}` : "";
    throw new Error(`WebSMS send failed (statusCode=${statusCode})${detail}`);
  }

  return {
    transferId: payload?.transferId,
    clientMessageId: payload?.clientMessageId,
  };
}

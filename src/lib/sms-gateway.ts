const SMS_GATEWAY_TIMEOUT_MS = 30_000;

type SmsGatewayJob = {
  id: string;
  to_number?: string;
  message?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
};

function gatewayBaseUrl(): string {
  const raw = process.env.SMS_GATEWAY_URL?.trim();
  if (!raw) {
    throw new Error("SMS_GATEWAY_URL is not set");
  }
  return raw.replace(/\/+$/, "");
}

function gatewayApiKey(): string {
  const raw = process.env.SMS_GATEWAY_API_KEY?.trim();
  if (!raw) {
    throw new Error("SMS_GATEWAY_API_KEY is not set");
  }
  return raw;
}

export async function sendViaSmsGateway(toNumber: string, message: string): Promise<string> {
  const url = `${gatewayBaseUrl()}/api/sms/jobs`;
  const apiKey = gatewayApiKey();

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to_number: toNumber, message }),
      signal: AbortSignal.timeout(SMS_GATEWAY_TIMEOUT_MS),
    });
  } catch (error: unknown) {
    const reason =
      error instanceof Error ? error.message : String(error);
    throw new Error(`SMS gateway request failed: ${reason}`);
  }

  if (response.status === 201) {
    let job: SmsGatewayJob;
    try {
      job = (await response.json()) as SmsGatewayJob;
    } catch {
      throw new Error("SMS gateway returned 201 with invalid JSON");
    }
    if (!job.id || typeof job.id !== "string") {
      throw new Error("SMS gateway response missing job id");
    }
    return job.id;
  }

  let detail = "";
  try {
    const body = (await response.json()) as { detail?: string; message?: string };
    detail = body.detail ?? body.message ?? "";
  } catch {
    try {
      detail = (await response.text()).slice(0, 200);
    } catch {
      /* ignore */
    }
  }

  const suffix = detail ? `: ${detail}` : "";
  throw new Error(`SMS gateway HTTP ${response.status}${suffix}`);
}

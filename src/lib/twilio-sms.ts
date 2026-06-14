import twilio from "twilio";

function twilioErrorCode(error: unknown): number | null {
  if (error && typeof error === "object" && "code" in error) {
    const c = (error as { code?: number | string }).code;
    if (c === undefined) {
      return null;
    }
    const n = Number(c);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function isInvalidFrom21212(error: unknown): boolean {
  if (twilioErrorCode(error) === 21_212) {
    return true;
  }
  const msg =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: string }).message)
      : String(error);
  return /21212|Invalid From/i.test(msg);
}

export async function sendViaTwilio(
  toNumber: string,
  message: string,
): Promise<{ sid?: string }> {
  const params = { phoneE164: toNumber, body: message };
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER?.trim();
  const alphaSenderId = process.env.TWILIO_ALPHA_SENDER_ID?.trim();
  const fromFallback = alphaSenderId || phoneNumber;

  if (!sid || !token) {
    console.log("SMS (dev fallback):", params);
    return {};
  }

  if (!messagingServiceSid && !fromFallback) {
    console.log(
      "SMS (dev fallback, no TWILIO_PHONE_NUMBER / TWILIO_ALPHA_SENDER_ID / TWILIO_MESSAGING_SERVICE_SID):",
      params,
    );
    return {};
  }

  const client = twilio(sid, token);

  try {
    if (messagingServiceSid) {
      const msg = await client.messages.create({
        messagingServiceSid,
        to: toNumber,
        body: message,
      });
      return { sid: msg.sid };
    }

    // Prefer Alphanumeric Sender ID; if Twilio returns 21212 and a number exists, retry with E.164 number.
    if (alphaSenderId && phoneNumber) {
      try {
        const msg = await client.messages.create({
          to: toNumber,
          from: alphaSenderId,
          body: message,
        });
        return { sid: msg.sid };
      } catch (firstErr) {
        if (isInvalidFrom21212(firstErr)) {
          console.warn(
            "[twilio] Alphanumeric From rejected (21212); retrying with TWILIO_PHONE_NUMBER. " +
              "Typical causes: Trial account (no alphanumeric), ID not allowed for destination (e.g. CY), or ID too generic — see https://www.twilio.com/docs/errors/21212",
          );
          const msg = await client.messages.create({
            to: toNumber,
            from: phoneNumber,
            body: message,
          });
          return { sid: msg.sid };
        }
        throw firstErr;
      }
    }

    const msg = await client.messages.create({
      to: toNumber,
      from: fromFallback!,
      body: message,
    });
    return { sid: msg.sid };
  } catch (error: unknown) {
    const raw =
      error && typeof error === "object" && "message" in error
        ? String((error as { message?: string }).message)
        : String(error);
    console.error("Twilio SMS failed:", error);
    if (isInvalidFrom21212(error)) {
      throw new Error(
        "Twilio rejected the sender (21212). Check: E.164 From, not on DNO list, alphanumeric not generic, " +
          "Trial accounts cannot use alphanumeric senders, sender must be allowed for Cyprus (+357). " +
          "https://www.twilio.com/docs/errors/21212 — If you use alphanumeric, also set TWILIO_PHONE_NUMBER: we retry with the number after 21212 when both are set.",
      );
    }
    throw error instanceof Error ? error : new Error(raw);
  }
}

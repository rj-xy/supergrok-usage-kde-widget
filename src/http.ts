import { setDefaultAutoSelectFamily, setDefaultAutoSelectFamilyAttemptTimeout } from "node:net";

import { FETCH_TIMEOUT_MS } from "./consts.js";

// Happy-eyeballs tuning: the 250ms default attempt timeout is shorter than
// some links' IPv4 connect RTT, so dual-stack hosts with a dead IPv6 route
// fail with ETIMEDOUT even though IPv4 works (e.g. api.z.ai).
setDefaultAutoSelectFamily(true);
setDefaultAutoSelectFamilyAttemptTimeout(1000);

export type HttpGetOptions = {
  userAgent: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  timeoutError?: string;
  networkError?: string;
};

export type HttpPostSseOptions = {
  userAgent: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  timeoutError?: string;
  networkError?: string;
  maxBodyBytes?: number;
};

export type HttpPostSseResult = {
  status: number;
  contentType: string;
  // Full body for non-SSE replies (error JSON or an inline usage object).
  // Always empty for SSE replies, which are consumed event by event.
  bodyText: string;
  sawEvents: boolean;
  stoppedEarly: boolean;
};

function toHttpError(
  err: unknown,
  options: { timeoutError?: string; networkError?: string },
): Error {
  if (err && typeof err === "object" && "name" in err && err.name === "AbortError")
    return new Error(options.timeoutError ?? "request timed out");
  const causeCode = err && typeof err === "object" && "cause" in err
    && err.cause && typeof err.cause === "object" && "code" in err.cause
    ? String(err.cause.code)
    : "";
  const cause = causeCode ? ` (${causeCode})` : "";
  return new Error((options.networkError ?? "could not fetch usage") + cause);
}

async function readTextCapped(response: Response, maxBytes: number): Promise<string> {
  try {
    const text = await response.text();
    return text.length > maxBytes ? text.slice(0, maxBytes) : text;
  } catch {
    return "";
  }
}

export async function httpGetJson(
  url: string,
  token: string,
  options: HttpGetOptions,
): Promise<[number, unknown]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": options.userAgent,
        ...options.headers,
      },
      signal: controller.signal,
    });
    let parsed: unknown = { error: "http_error" };
    try {
      parsed = await response.json();
    } catch {
      parsed = { error: "http_error" };
    }
    return [response.status, parsed];
  } catch (err) {
    throw toHttpError(err, options);
  } finally {
    clearTimeout(timer);
  }
}

// POST a JSON body and consume a text/event-stream reply. Each parsed `data:`
// payload is passed to onEvent, which returns true to stop the stream early
// (the reader is cancelled so a metered call stays tiny). Non-SSE replies
// (errors, inline JSON) are returned whole in bodyText instead.
export async function httpPostSse(
  url: string,
  token: string,
  jsonBody: unknown,
  options: HttpPostSseOptions,
  onEvent: (event: unknown) => boolean,
): Promise<HttpPostSseResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "text/event-stream, application/json",
        "Content-Type": "application/json",
        "User-Agent": options.userAgent,
        ...options.headers,
      },
      body: JSON.stringify(jsonBody),
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (response.status >= 400 || !contentType.includes("text/event-stream")) {
      const bodyText = await readTextCapped(response, options.maxBodyBytes ?? 8192);
      return {
        status: response.status,
        contentType,
        bodyText,
        sawEvents: false,
        stoppedEarly: false,
      };
    }
    const reader = response.body?.getReader();
    if (!reader) {
      return {
        status: response.status,
        contentType,
        bodyText: "",
        sawEvents: false,
        stoppedEarly: false,
      };
    }
    const decoder = new TextDecoder();
    let buffered = "";
    let sawEvents = false;
    let stoppedEarly = false;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done)
          break;
        buffered += decoder.decode(value, { stream: true });
        let newline = buffered.indexOf("\n");
        while (newline !== -1) {
          const line = buffered.slice(0, newline).replace(/\r$/, "").trim();
          buffered = buffered.slice(newline + 1);
          newline = buffered.indexOf("\n");
          if (!line || line.startsWith(":") || !line.startsWith("data:"))
            continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]")
            continue;
          let event: unknown;
          try {
            event = JSON.parse(data);
          } catch {
            continue;
          }
          sawEvents = true;
          if (onEvent(event)) {
            stoppedEarly = true;
            break;
          }
        }
        if (stoppedEarly)
          break;
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        // already closed
      }
      reader.releaseLock();
    }
    return { status: response.status, contentType, bodyText: "", sawEvents, stoppedEarly };
  } catch (err) {
    throw toHttpError(err, options);
  } finally {
    clearTimeout(timer);
  }
}

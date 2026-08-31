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
    if (err && typeof err === "object" && "name" in err && err.name === "AbortError")
      throw new Error(options.timeoutError ?? "request timed out");
    const causeCode = err && typeof err === "object" && "cause" in err
      && err.cause && typeof err.cause === "object" && "code" in err.cause
      ? String(err.cause.code)
      : "";
    const cause = causeCode ? ` (${causeCode})` : "";
    throw new Error((options.networkError ?? "could not fetch usage") + cause);
  } finally {
    clearTimeout(timer);
  }
}

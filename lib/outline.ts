import { createHash } from "node:crypto";
import https from "node:https";
import type { TLSSocket } from "node:tls";
import type { IncomingHttpHeaders } from "node:http";

export type OutlineKey = { id: string | number; accessUrl: string };

type OutlineResponse = {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
};

function serverApiUrl(slot: number) {
  const key = `OUTLINE_SERVER_${slot}_API_URL`;
  const value = process.env[key];
  if (!value) throw new Error(`Outline server ${slot} is not configured.`);

  const normalized = value.trim().replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error(`Outline server ${slot} has an invalid API URL.`);
  }
  if (url.protocol !== "https:") {
    throw new Error(`Outline server ${slot} API URL must use HTTPS.`);
  }
  return normalized;
}

function expectedCertificateFingerprint(slot: number) {
  const key = `OUTLINE_SERVER_${slot}_CERT_SHA256`;
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Outline server ${slot} certificate pin is missing (${key}).`);
  }
  const normalized = value.replace(/[^a-fA-F0-9]/g, "").toLowerCase();
  if (normalized.length !== 64) {
    throw new Error(`${key} must contain a SHA-256 certificate fingerprint (64 hex characters).`);
  }
  return normalized;
}

/** Pin the leaf certificate before sending any HTTP request bytes. */
async function outlineRequest(
  slot: number,
  path: string,
  options: { method: string; body?: unknown },
): Promise<OutlineResponse> {
  const baseUrl = serverApiUrl(slot);
  const expectedPin = expectedCertificateFingerprint(slot);
  const url = new URL(`${baseUrl}${path}`);
  const stage = `${options.method} ${path.split("?")[0]}`;

  return new Promise((resolve, reject) => {
    let pinChecked = false;
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);
    const request = https.request(
      url,
      {
        method: options.method,
        rejectUnauthorized: false,
        headers: body === undefined ? undefined : {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          if (settled) return;
          settled = true;
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
        response.on("error", (error) => fail(new Error(
          `Outline server ${slot} ${stage} response error: ${error.message}`,
        )));
      },
    );

    request.on("socket", (socket) => {
      const tlsSocket = socket as TLSSocket;
      tlsSocket.once("secureConnect", () => {
        const certificate = tlsSocket.getPeerCertificate();
        if (!certificate.raw) {
          request.destroy(new Error(`Outline server ${slot} did not present a TLS certificate.`));
          return;
        }
        const actualPin = createHash("sha256").update(certificate.raw).digest("hex");
        if (actualPin !== expectedPin) {
          request.destroy(new Error(
            `Outline server ${slot} TLS certificate fingerprint did not match its configured pin.`,
          ));
          return;
        }
        pinChecked = true;
        if (body === undefined) request.end();
        else request.end(body);
      });
    });

    request.setTimeout(15_000, () => {
      request.destroy(new Error(`Outline server ${slot} ${stage} timed out after 15 seconds.`));
    });
    request.on("error", (error) => {
      if (!pinChecked && /certificate/i.test(error.message)) {
        fail(new Error(`Outline server ${slot} TLS certificate verification failed during ${stage}.`));
      } else {
        fail(new Error(`Outline server ${slot} ${stage} failed: ${error.message}`));
      }
    });
  });
}

export async function createOutlineKey(slot: number, label: string): Promise<OutlineKey> {
  const response = await outlineRequest(slot, "/access-keys", { method: "POST" });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Outline server ${slot} could not create a key (HTTP ${response.status}).`);
  }

  let data: { id?: string | number; accessUrl?: string };
  try {
    data = JSON.parse(response.body) as { id?: string | number; accessUrl?: string };
  } catch {
    throw new Error("Outline returned an invalid key response.");
  }
  if (data.id === undefined || !data.accessUrl) {
    throw new Error("Outline returned an invalid key response.");
  }

  // Naming is optional: never mark a successfully-created key as failed just
  // because the separate rename request is interrupted.
  try {
    await outlineRequest(
      slot,
      `/access-keys/${encodeURIComponent(String(data.id))}/name`,
      { method: "PUT", body: { name: label.slice(0, 64) } },
    );
  } catch {
    // Keep the valid key and continue to database persistence.
  }

  return { id: String(data.id), accessUrl: data.accessUrl };
}

export async function revokeOutlineKey(slot: number, keyId: string) {
  const response = await outlineRequest(
    slot,
    `/access-keys/${encodeURIComponent(keyId)}`,
    { method: "DELETE" },
  );
  if (response.status < 200 || response.status >= 300) {
    if (response.status !== 404) {
      throw new Error(`Outline server ${slot} could not revoke a key (HTTP ${response.status}).`);
    }
  }
}

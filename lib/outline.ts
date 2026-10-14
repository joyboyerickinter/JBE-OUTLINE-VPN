export type OutlineKey = { id: string | number; accessUrl: string };

function serverApiUrl(slot: number) {
  const key = `OUTLINE_SERVER_${slot}_API_URL`;
  const value = process.env[key];
  if (!value) throw new Error(`Outline server ${slot} is not configured.`);
  return value.replace(/\/+$/, "");
}

export async function createOutlineKey(slot: number, label: string): Promise<OutlineKey> {
  const response = await fetch(`${serverApiUrl(slot)}/access-keys`, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Outline server ${slot} could not create a key.`);
  const data = await response.json() as { id: string | number; accessUrl: string };
  if (data.id === undefined || !data.accessUrl) throw new Error("Outline returned an invalid key response.");

  const rename = await fetch(`${serverApiUrl(slot)}/access-keys/${encodeURIComponent(String(data.id))}/name`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: label.slice(0, 64) }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!rename.ok) {
    // A created key still works even if naming fails; keep the key so the order can be fulfilled.
  }
  return { id: String(data.id), accessUrl: data.accessUrl };
}

export async function revokeOutlineKey(slot: number, keyId: string) {
  const response = await fetch(`${serverApiUrl(slot)}/access-keys/${encodeURIComponent(keyId)}`, {
    method: "DELETE",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok && response.status !== 404) throw new Error(`Outline server ${slot} could not revoke a key.`);
}

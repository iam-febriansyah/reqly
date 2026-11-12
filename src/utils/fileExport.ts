import type { HttpResponseData, SavedRequest } from "../types";

function sanitizeFilename(name: string): string {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9_\- ]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .toLowerCase() || "api_payload";
}

/**
 * Triggers browser/webview download for JSON content
 */
export function downloadJsonFile(filename: string, content: string | object) {
  let jsonString: string;
  if (typeof content === "string") {
    try {
      const parsed = JSON.parse(content);
      jsonString = JSON.stringify(parsed, null, 2);
    } catch {
      jsonString = content;
    }
  } else {
    jsonString = JSON.stringify(content, null, 2);
  }

  const finalName = filename.endsWith(".json") ? filename : `${filename}.json`;
  const blob = new Blob([jsonString], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = finalName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return finalName;
}

/**
 * Save request body payload as a standalone JSON file
 */
export function exportRequestBodyJson(request: SavedRequest): string {
  const baseName = sanitizeFilename(request.name || "request");
  const filename = `${baseName}_request.json`;

  if (request.body.mode === "json" || request.body.mode === "raw") {
    return downloadJsonFile(filename, request.body.raw || "{}");
  }

  if (request.body.mode === "urlencoded") {
    const obj: Record<string, string> = {};
    for (const item of request.body.urlencoded) {
      if (item.enabled && item.key.trim()) {
        obj[item.key.trim()] = item.value;
      }
    }
    return downloadJsonFile(filename, obj);
  }

  if (request.body.mode === "formdata") {
    const obj: Record<string, string> = {};
    for (const item of request.body.formdata) {
      if (item.enabled && item.key.trim()) {
        obj[item.key.trim()] = item.value;
      }
    }
    return downloadJsonFile(filename, obj);
  }

  // Bodiless request (e.g. GET) - export params/meta
  const obj: Record<string, any> = {
    method: request.method,
    url: request.url,
    params: request.params.filter((p) => p.enabled && p.key),
  };
  return downloadJsonFile(filename, obj);
}

/**
 * Save response body as a JSON file
 */
export function exportResponseBodyJson(
  requestName: string,
  response: HttpResponseData
): string {
  const baseName = sanitizeFilename(requestName || "response");
  const filename = `${baseName}_response.json`;

  return downloadJsonFile(filename, response.body || "{}");
}

/**
 * Save combined Request + Response contract as a JSON file
 * Ideal for frontend & backend developers handoff / documentation
 */
export function exportRequestResponseExchange(
  request: SavedRequest,
  response: HttpResponseData
): string {
  const baseName = sanitizeFilename(request.name || "exchange");
  const filename = `${baseName}_contract.json`;

  let parsedRequestBody: any = request.body.raw;
  try {
    parsedRequestBody = JSON.parse(request.body.raw);
  } catch {
    // Keep as raw string if not JSON
  }

  let parsedResponseBody: any = response.body;
  try {
    parsedResponseBody = JSON.parse(response.body);
  } catch {
    // Keep as raw string
  }

  const contract = {
    title: request.name,
    exportedAt: new Date().toISOString(),
    request: {
      method: request.method,
      url: request.url,
      headers: request.headers
        .filter((h) => h.enabled && h.key)
        .reduce((acc, h) => ({ ...acc, [h.key]: h.value }), {}),
      params: request.params
        .filter((p) => p.enabled && p.key)
        .reduce((acc, p) => ({ ...acc, [p.key]: p.value }), {}),
      bodyMode: request.body.mode,
      body: parsedRequestBody,
    },
    response: {
      status: response.status,
      statusText: response.statusText,
      durationMs: response.durationMs,
      sizeBytes: response.sizeBytes,
      headers: response.headers.reduce(
        (acc, h) => ({ ...acc, [h.key]: h.value }),
        {}
      ),
      body: parsedResponseBody,
    },
  };

  return downloadJsonFile(filename, contract);
}


import type { HttpResponseData, SavedRequest } from "../types";
import { api } from "../services/api";

function sanitizeFilename(name: string): string {
  return (
    name
      .trim()
      .replace(/[^a-zA-Z0-9_\- ]/g, "")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .toLowerCase() || "api_payload"
  );
}

/**
 * Saves file with native OS Save As dialog so the user can choose the exact destination!
 */
export async function saveJsonWithDialog(
  defaultName: string,
  content: string | object,
  options?: { filterName?: string; filterExt?: string; isBase64?: boolean }
): Promise<string | null> {
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

  const ext = options?.filterExt || "json";
  const finalDefaultName = defaultName.endsWith(`.${ext}`)
    ? defaultName
    : `${defaultName}.${ext}`;

  return api.saveFileDialog({
    defaultName: finalDefaultName,
    content: jsonString,
    isBase64: options?.isBase64,
    filterName: options?.filterName || "JSON Files (*.json)",
    filterExt: ext,
  });
}

/**
 * Save request body payload as a standalone JSON file using native Save Dialog
 */
export async function exportRequestBodyJson(
  request: SavedRequest
): Promise<string | null> {
  const baseName = sanitizeFilename(request.name || "request");
  const filename = `${baseName}_request.json`;

  if (request.body.mode === "json" || request.body.mode === "raw") {
    return saveJsonWithDialog(filename, request.body.raw || "{}");
  }

  if (request.body.mode === "urlencoded") {
    const obj: Record<string, string> = {};
    for (const item of request.body.urlencoded) {
      if (item.enabled && item.key.trim()) {
        obj[item.key.trim()] = item.value;
      }
    }
    return saveJsonWithDialog(filename, obj);
  }

  if (request.body.mode === "formdata") {
    const obj: Record<string, string> = {};
    for (const item of request.body.formdata) {
      if (item.enabled && item.key.trim()) {
        obj[item.key.trim()] = item.value;
      }
    }
    return saveJsonWithDialog(filename, obj);
  }

  // Bodiless request (e.g. GET) - export params/meta
  const obj: Record<string, any> = {
    method: request.method,
    url: request.url,
    params: request.params.filter((p) => p.enabled && p.key),
  };
  return saveJsonWithDialog(filename, obj);
}

/**
 * Save response body as a JSON file using native Save Dialog
 */
export async function exportResponseBodyJson(
  requestName: string,
  response: HttpResponseData
): Promise<string | null> {
  const baseName = sanitizeFilename(requestName || "response");

  if (response.isImage && response.imageBase64) {
    const ext = response.contentType.split("/")[1] || "png";
    return saveJsonWithDialog(`${baseName}.${ext}`, response.imageBase64, {
      filterName: `Images (*.${ext})`,
      filterExt: ext,
      isBase64: true,
    });
  }

  const filename = `${baseName}_response.json`;
  return saveJsonWithDialog(filename, response.body || "{}");
}

/**
 * Save combined Request + Response contract as a JSON file using native Save Dialog
 */
export async function exportRequestResponseExchange(
  request: SavedRequest,
  response: HttpResponseData
): Promise<string | null> {
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

  return saveJsonWithDialog(filename, contract);
}

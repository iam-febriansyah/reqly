import type { EnvironmentVariable } from "../types";

export interface SuggestionItem {
  value: string;
  description?: string;
  category?: "header" | "value" | "variable" | "param";
}

export const COMMON_HEADER_KEYS: SuggestionItem[] = [
  { value: "Accept", description: "Acceptable media types for response" },
  { value: "Accept-Charset", description: "Character sets that are acceptable" },
  { value: "Accept-Encoding", description: "Acceptable compression algorithms (gzip, br)" },
  { value: "Accept-Language", description: "Preferred natural human languages" },
  { value: "Access-Control-Allow-Credentials", description: "CORS: expose response to frontend JS" },
  { value: "Access-Control-Allow-Headers", description: "CORS: allowed HTTP headers in preflight" },
  { value: "Access-Control-Allow-Methods", description: "CORS: allowed HTTP methods in preflight" },
  { value: "Access-Control-Allow-Origin", description: "CORS: allowed origin domains" },
  { value: "Access-Control-Expose-Headers", description: "CORS: headers exposed to frontend" },
  { value: "Access-Control-Max-Age", description: "CORS: cache duration for preflight (sec)" },
  { value: "Access-Control-Request-Headers", description: "CORS: headers used in actual request" },
  { value: "Access-Control-Request-Method", description: "CORS: method used in actual request" },
  { value: "Age", description: "Age of object in proxy cache (seconds)" },
  { value: "Allow", description: "List of HTTP methods supported by resource" },
  { value: "Authorization", description: "Authentication credentials (Bearer, Basic, etc.)" },
  { value: "Cache-Control", description: "Caching directives for request/response" },
  { value: "Clear-Site-Data", description: "Clear cookies/storage/cache for origin" },
  { value: "Connection", description: "Manage persistent TCP connection (keep-alive)" },
  { value: "Content-Disposition", description: "Directives for inline display vs attachment download" },
  { value: "Content-Encoding", description: "Compression encoding of payload body" },
  { value: "Content-Language", description: "Natural language of payload content" },
  { value: "Content-Length", description: "Size of message body in bytes" },
  { value: "Content-Location", description: "Alternate location for returned data" },
  { value: "Content-Range", description: "Where in full body partial message belongs" },
  { value: "Content-Security-Policy", description: "Security policy for resource loading" },
  { value: "Content-Type", description: "MIME type of body (e.g. application/json)" },
  { value: "Cookie", description: "Stored HTTP cookies previously sent by server" },
  { value: "Date", description: "Date and time the message was originated" },
  { value: "DNT", description: "Do Not Track request signal (1/0)" },
  { value: "ETag", description: "Unique entity tag identifier for cache validation" },
  { value: "Expect", description: "Expectations required to be met by server" },
  { value: "Expires", description: "Date after which response is considered stale" },
  { value: "Forwarded", description: "Discloses original info of client through proxy" },
  { value: "From", description: "Email address of user making request" },
  { value: "Host", description: "Host domain and port number of target server" },
  { value: "If-Match", description: "Only proceed if ETag matches" },
  { value: "If-Modified-Since", description: "Only return 200 if modified since date" },
  { value: "If-None-Match", description: "Only return if ETag does not match (caching)" },
  { value: "If-Range", description: "Conditional byte-range request" },
  { value: "If-Unmodified-Since", description: "Only proceed if unmodified since date" },
  { value: "Keep-Alive", description: "Hints for connection timeout and max requests" },
  { value: "Location", description: "URL to redirect a page to" },
  { value: "Origin", description: "Origin scheme, host, and port of the request" },
  { value: "Pragma", description: "Legacy HTTP/1.0 directives (e.g. no-cache)" },
  { value: "Proxy-Authenticate", description: "Defines proxy authentication challenge" },
  { value: "Proxy-Authorization", description: "Credentials for authenticating with a proxy" },
  { value: "Range", description: "Request only specific byte range of resource" },
  { value: "Referer", description: "Address of previous web page linked from" },
  { value: "Retry-After", description: "How long client should wait before retry" },
  { value: "Sec-Fetch-Dest", description: "Indicates target destination of request" },
  { value: "Sec-Fetch-Mode", description: "Indicates request mode (cors, navigate, etc.)" },
  { value: "Sec-Fetch-Site", description: "Relationship between initiator and target" },
  { value: "Sec-Fetch-User", description: "Whether request was triggered by user action" },
  { value: "Server", description: "Software identifier of origin server" },
  { value: "Set-Cookie", description: "Send cookie from server to user agent" },
  { value: "Strict-Transport-Security", description: "Enforces HTTPS connections (HSTS)" },
  { value: "TE", description: "Transfer encodings user agent accepts" },
  { value: "Trailer", description: "Fields included in trailer of chunked message" },
  { value: "Transfer-Encoding", description: "Form of encoding used to safely transfer body" },
  { value: "Upgrade", description: "Request server switch to another protocol" },
  { value: "Upgrade-Insecure-Requests", description: "Signal preference for encrypted HTTPS response" },
  { value: "User-Agent", description: "Client software identity string" },
  { value: "Vary", description: "Headers determining cache key matches" },
  { value: "Via", description: "Informs of intermediate proxies" },
  { value: "Warning", description: "General warnings regarding message content" },
  { value: "WWW-Authenticate", description: "Defines authentication method for resource" },
  { value: "X-Api-Key", description: "Custom API key authentication token" },
  { value: "X-Auth-Token", description: "Custom auth token header" },
  { value: "X-CSRF-Token", description: "Anti-CSRF protection token" },
  { value: "X-Client-ID", description: "Application client identifier" },
  { value: "X-Correlation-ID", description: "Unique request identifier for distributed tracing" },
  { value: "X-Forwarded-For", description: "Originating IP address through proxy" },
  { value: "X-Forwarded-Host", description: "Original Host header received by proxy" },
  { value: "X-Forwarded-Port", description: "Original port requested by client" },
  { value: "X-Forwarded-Proto", description: "Original protocol (http/https) before proxy" },
  { value: "X-Frame-Options", description: "Controls whether iframe embedding is allowed" },
  { value: "X-Request-ID", description: "Unique tracking ID for tracing request flow" },
  { value: "X-Requested-With", description: "Identifies AJAX/XMLHttpRequest requests" },
].map((item) => ({ ...item, category: "header" as const }));

export const COMMON_HEADER_VALUES: Record<string, SuggestionItem[]> = {
  "content-type": [
    { value: "application/json", description: "JSON document payload" },
    { value: "application/x-www-form-urlencoded", description: "Standard URL-encoded form data" },
    { value: "multipart/form-data", description: "Multipart form with file uploads" },
    { value: "text/plain", description: "Plain unformatted text" },
    { value: "text/html", description: "HTML webpage content" },
    { value: "application/xml", description: "XML structured markup" },
    { value: "text/xml", description: "XML text format" },
    { value: "application/octet-stream", description: "Binary byte stream / generic file" },
    { value: "application/pdf", description: "PDF document" },
    { value: "application/javascript", description: "JavaScript script file" },
    { value: "text/css", description: "CSS stylesheet" },
    { value: "text/csv", description: "Comma-separated values" },
    { value: "image/png", description: "PNG image" },
    { value: "image/jpeg", description: "JPEG image" },
    { value: "image/webp", description: "WebP image" },
    { value: "image/svg+xml", description: "Scalable Vector Graphics" },
    { value: "application/graphql+json", description: "GraphQL JSON payload" },
  ],
  accept: [
    { value: "application/json", description: "Accept JSON responses" },
    { value: "*/*", description: "Accept any response media type" },
    { value: "application/xml", description: "Accept XML responses" },
    { value: "text/plain", description: "Accept plain text" },
    { value: "text/html", description: "Accept HTML pages" },
    { value: "text/csv", description: "Accept CSV files" },
    { value: "application/octet-stream", description: "Accept binary stream / downloads" },
    { value: "application/pdf", description: "Accept PDF files" },
    { value: "image/*", description: "Accept any image format" },
  ],
  authorization: [
    { value: "Bearer {{token}}", description: "Bearer token with environment variable" },
    { value: "Bearer ", description: "Bearer authentication prefix" },
    { value: "Basic {{credentials}}", description: "Basic auth with Base64 variable" },
    { value: "Basic ", description: "Basic authentication prefix" },
    { value: "ApiKey {{api_key}}", description: "API Key prefix" },
    { value: "Digest ", description: "Digest HTTP authentication" },
  ],
  "cache-control": [
    { value: "no-cache", description: "Force revalidation with origin server" },
    { value: "no-store", description: "Never store any part in cache" },
    { value: "max-age=0", description: "Stale immediately, forces revalidation" },
    { value: "max-age=3600", description: "Cache response for 1 hour" },
    { value: "max-age=86400", description: "Cache response for 24 hours" },
    { value: "must-revalidate", description: "Must revalidate stale entries" },
    { value: "public", description: "Can be cached by proxies and CDN" },
    { value: "private", description: "Can only be cached by user browser" },
    { value: "no-transform", description: "No payload modifications by proxies" },
    { value: "only-if-cached", description: "Do not contact network; use cache only" },
  ],
  connection: [
    { value: "keep-alive", description: "Maintain persistent connection" },
    { value: "close", description: "Close connection after response" },
  ],
  "accept-encoding": [
    { value: "gzip, deflate, br", description: "Accept Brotli, Gzip, and Deflate" },
    { value: "gzip, deflate", description: "Standard compression" },
    { value: "gzip", description: "Gzip compression only" },
    { value: "br", description: "Brotli compression only" },
    { value: "identity", description: "No compression" },
    { value: "*", description: "Accept any compression" },
  ],
  "accept-language": [
    { value: "*", description: "Accept any language" },
    { value: "en-US,en;q=0.9", description: "English (US) preferred" },
    { value: "id-ID,id;q=0.9,en;q=0.8", description: "Indonesian preferred, English fallback" },
    { value: "en-GB,en;q=0.8", description: "English (Great Britain)" },
    { value: "zh-CN,zh;q=0.9", description: "Chinese (Simplified)" },
    { value: "ja-JP,ja;q=0.9", description: "Japanese" },
  ],
  "user-agent": [
    { value: "Reqly/1.0.0", description: "Reqly native desktop API client" },
    { value: "PostmanRuntime/7.39.0", description: "Postman Runtime client" },
    { value: "curl/8.4.0", description: "cURL command line utility" },
    {
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      description: "Chrome on Windows x64",
    },
    {
      value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      description: "Chrome on macOS",
    },
  ],
  "content-encoding": [
    { value: "gzip", description: "Gzip compressed body" },
    { value: "br", description: "Brotli compressed body" },
    { value: "deflate", description: "Deflate compressed body" },
  ],
  "access-control-request-method": [
    { value: "GET", description: "GET method" },
    { value: "POST", description: "POST method" },
    { value: "PUT", description: "PUT method" },
    { value: "DELETE", description: "DELETE method" },
    { value: "PATCH", description: "PATCH method" },
    { value: "OPTIONS", description: "OPTIONS preflight" },
  ],
  "access-control-allow-origin": [
    { value: "*", description: "Allow all origins" },
    { value: "http://localhost:3000", description: "Local React/Next dev server" },
    { value: "http://localhost:5173", description: "Local Vite dev server" },
  ],
  "x-requested-with": [
    { value: "XMLHttpRequest", description: "AJAX request header" },
  ],
  pragma: [
    { value: "no-cache", description: "HTTP/1.0 legacy cache prevention" },
  ],
  dnt: [
    { value: "1", description: "Do Not Track active" },
    { value: "0", description: "Do Not Track inactive" },
  ],
  "sec-fetch-dest": [
    { value: "empty", description: "Empty destination (AJAX/fetch)" },
    { value: "document", description: "Full document load" },
    { value: "image", description: "Image asset" },
    { value: "script", description: "Script asset" },
  ],
  "sec-fetch-mode": [
    { value: "cors", description: "CORS mode" },
    { value: "navigate", description: "Navigation mode" },
    { value: "no-cors", description: "No-CORS mode" },
    { value: "same-origin", description: "Same-origin only" },
  ],
  "sec-fetch-site": [
    { value: "same-origin", description: "Same origin request" },
    { value: "same-site", description: "Same site request" },
    { value: "cross-site", description: "Cross-site request" },
    { value: "none", description: "Direct navigation / none" },
  ],
};

export const COMMON_PARAM_KEYS: SuggestionItem[] = [
  { value: "page", description: "Page number for pagination" },
  { value: "limit", description: "Maximum number of records per page" },
  { value: "size", description: "Page size" },
  { value: "offset", description: "Number of records to skip" },
  { value: "sort", description: "Field to sort results by (e.g. createdAt)" },
  { value: "order", description: "Sort direction: asc or desc" },
  { value: "q", description: "Search query text" },
  { value: "search", description: "Search term" },
  { value: "filter", description: "Filter expression" },
  { value: "status", description: "Status filter (e.g. active, pending)" },
  { value: "userId", description: "User ID parameter" },
  { value: "fields", description: "Fields projection (e.g. id,name,email)" },
].map((item) => ({ ...item, category: "param" as const }));

export const COMMON_PARAM_VALUES: Record<string, SuggestionItem[]> = {
  order: [
    { value: "asc", description: "Ascending order" },
    { value: "desc", description: "Descending order" },
  ],
  page: [
    { value: "1", description: "First page" },
    { value: "2", description: "Second page" },
  ],
  limit: [
    { value: "10", description: "10 items per page" },
    { value: "20", description: "20 items per page" },
    { value: "50", description: "50 items per page" },
    { value: "100", description: "100 items per page" },
  ],
  size: [
    { value: "10", description: "10 items" },
    { value: "20", description: "20 items" },
    { value: "50", description: "50 items" },
  ],
  status: [
    { value: "active", description: "Active records" },
    { value: "inactive", description: "Inactive records" },
    { value: "pending", description: "Pending status" },
    { value: "completed", description: "Completed status" },
  ],
};

/**
 * Extract active variable token if cursor / string is currently typing `{{...`
 */
export function extractVariableQuery(text: string): { isVariable: boolean; query: string; prefix: string } {
  const lastDoubleBrace = text.lastIndexOf("{{");
  if (lastDoubleBrace !== -1) {
    const after = text.slice(lastDoubleBrace + 2);
    if (!after.includes("}}")) {
      return {
        isVariable: true,
        query: after.trim().toLowerCase(),
        prefix: text.slice(0, lastDoubleBrace),
      };
    }
  }
  return { isVariable: false, query: "", prefix: "" };
}

/**
 * Filter environment variables into suggestion items
 */
export function getVariableSuggestions(
  query: string,
  variables: EnvironmentVariable[] = []
): SuggestionItem[] {
  const q = query.toLowerCase();
  return variables
    .filter((v) => v.enabled && (!q || v.key.toLowerCase().includes(q)))
    .map((v) => ({
      value: `{{${v.key}}}`,
      description: v.value ? `= ${v.value.length > 28 ? v.value.slice(0, 28) + "…" : v.value}` : "Environment Variable",
      category: "variable" as const,
    }));
}

/**
 * Get suggestions for Header Key input
 */
export function getHeaderKeySuggestions(
  query: string,
  variables: EnvironmentVariable[] = []
): SuggestionItem[] {
  const varCheck = extractVariableQuery(query);
  if (varCheck.isVariable) {
    return getVariableSuggestions(varCheck.query, variables);
  }

  const q = query.trim().toLowerCase();
  if (!q) {
    return COMMON_HEADER_KEYS.slice(0, 24);
  }

  // Prioritize prefix match, then substring match
  const startsWith: SuggestionItem[] = [];
  const contains: SuggestionItem[] = [];

  for (const item of COMMON_HEADER_KEYS) {
    const valLower = item.value.toLowerCase();
    if (valLower.startsWith(q)) {
      startsWith.push(item);
    } else if (valLower.includes(q)) {
      contains.push(item);
    }
  }

  return [...startsWith, ...contains].slice(0, 20);
}

/**
 * Get suggestions for Header Value input based on the row's header key
 */
export function getHeaderValueSuggestions(
  headerKey: string,
  currentValue: string,
  variables: EnvironmentVariable[] = []
): SuggestionItem[] {
  const varCheck = extractVariableQuery(currentValue);
  if (varCheck.isVariable) {
    return getVariableSuggestions(varCheck.query, variables);
  }

  const normalizedKey = headerKey.trim().toLowerCase();
  const knownValues = COMMON_HEADER_VALUES[normalizedKey] || [];
  const valQuery = currentValue.trim().toLowerCase();

  let matchedValues: SuggestionItem[] = [];

  if (!valQuery) {
    matchedValues = knownValues.slice(0, 16);
  } else {
    const startsWith: SuggestionItem[] = [];
    const contains: SuggestionItem[] = [];
    for (const item of knownValues) {
      const v = item.value.toLowerCase();
      if (v.startsWith(valQuery)) {
        startsWith.push(item);
      } else if (v.includes(valQuery)) {
        contains.push(item);
      }
    }
    matchedValues = [...startsWith, ...contains].slice(0, 16);
  }

  // Also append active variables as convenient options if matching or empty
  if (variables.length > 0) {
    const varItems = getVariableSuggestions(valQuery, variables).slice(0, 4);
    return [...matchedValues, ...varItems];
  }

  return matchedValues;
}

/**
 * Get suggestions for Query Param Key
 */
export function getParamKeySuggestions(
  query: string,
  variables: EnvironmentVariable[] = []
): SuggestionItem[] {
  const varCheck = extractVariableQuery(query);
  if (varCheck.isVariable) {
    return getVariableSuggestions(varCheck.query, variables);
  }

  const q = query.trim().toLowerCase();
  if (!q) {
    return COMMON_PARAM_KEYS;
  }

  const startsWith: SuggestionItem[] = [];
  const contains: SuggestionItem[] = [];

  for (const item of COMMON_PARAM_KEYS) {
    const valLower = item.value.toLowerCase();
    if (valLower.startsWith(q)) {
      startsWith.push(item);
    } else if (valLower.includes(q)) {
      contains.push(item);
    }
  }

  return [...startsWith, ...contains].slice(0, 15);
}

/**
 * Get suggestions for Query Param Value
 */
export function getParamValueSuggestions(
  paramKey: string,
  currentValue: string,
  variables: EnvironmentVariable[] = []
): SuggestionItem[] {
  const varCheck = extractVariableQuery(currentValue);
  if (varCheck.isVariable) {
    return getVariableSuggestions(varCheck.query, variables);
  }

  const normalizedKey = paramKey.trim().toLowerCase();
  const knownValues = COMMON_PARAM_VALUES[normalizedKey] || [];
  const valQuery = currentValue.trim().toLowerCase();

  let matchedValues: SuggestionItem[] = [];
  if (!valQuery) {
    matchedValues = knownValues;
  } else {
    matchedValues = knownValues.filter((item) =>
      item.value.toLowerCase().includes(valQuery)
    );
  }

  if (variables.length > 0) {
    const varItems = getVariableSuggestions(valQuery, variables).slice(0, 4);
    return [...matchedValues, ...varItems];
  }

  return matchedValues;
}


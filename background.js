// Store for network requests
let networkRequests = [];
let requestCounter = 0;

// Initialize
function init() {
  // Set up request interception
  chrome.webRequest.onBeforeRequest.addListener(
    handleBeforeRequest,
    { urls: ["<all_urls>"] },
    ["requestBody"]
  );

  chrome.webRequest.onBeforeSendHeaders.addListener(
    handleBeforeSendHeaders,
    { urls: ["<all_urls>"] },
    ["requestHeaders"]
  );

  chrome.webRequest.onResponseStarted.addListener(
    handleResponseStarted,
    { urls: ["<all_urls>"] },
    ["responseHeaders"]
  );

  chrome.webRequest.onCompleted.addListener(
    handleCompleted,
    { urls: ["<all_urls>"] },
    ["responseHeaders"]
  );

  chrome.webRequest.onErrorOccurred.addListener(handleError, {
    urls: ["<all_urls>"],
  });

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener(handleMessage);
}

// Handle before request (captures request body)
function handleBeforeRequest(details) {
  const requestId = details.requestId;

  // Create or update request object
  const index = networkRequests.findIndex((req) => req.requestId === requestId);

  if (index === -1) {
    // New request
    const request = {
      id: `req_${requestCounter++}`,
      requestId: requestId,
      url: details.url,
      method: details.method,
      startTime: details.timeStamp,
      status: null,
      size: 0,
      time: null,
      type: details.type,
      requestBody: null,
      requestHeaders: {},
      responseHeaders: {},
      responseBody: null,
    };

    // Parse request body if available
    if (details.requestBody) {
      if (details.requestBody.raw) {
        // Binary data - not fully supported yet
        request.requestBody = "Binary data";
      } else if (details.requestBody.formData) {
        request.requestBody = JSON.stringify(details.requestBody.formData);
      }
    }

    networkRequests.push(request);
  } else {
    // Existing request
    const request = networkRequests[index];

    if (details.requestBody) {
      if (details.requestBody.raw) {
        request.requestBody = "Binary data";
      } else if (details.requestBody.formData) {
        request.requestBody = JSON.stringify(details.requestBody.formData);
      }
    }
  }

  return {};
}

// Handle before send headers (captures request headers)
function handleBeforeSendHeaders(details) {
  const requestId = details.requestId;

  const index = networkRequests.findIndex((req) => req.requestId === requestId);
  if (index === -1) return {};

  const request = networkRequests[index];

  // Extract headers
  if (details.requestHeaders) {
    const headers = {};
    details.requestHeaders.forEach((header) => {
      headers[header.name] = header.value;
    });
    request.requestHeaders = headers;
  }

  return {};
}

// Handle response started (captures response headers)
function handleResponseStarted(details) {
  const requestId = details.requestId;

  const index = networkRequests.findIndex((req) => req.requestId === requestId);
  if (index === -1) return;

  const request = networkRequests[index];

  // Update status code
  request.status = details.statusCode;

  // Extract response headers
  if (details.responseHeaders) {
    const headers = {};
    details.responseHeaders.forEach((header) => {
      headers[header.name] = header.value;
    });
    request.responseHeaders = headers;

    // Try to get content length
    const contentLength =
      headers["content-length"] || headers["Content-Length"];
    if (contentLength) {
      request.size = parseInt(contentLength, 10);
    }
  }
}

// Handle completed request
function handleCompleted(details) {
  const requestId = details.requestId;

  const index = networkRequests.findIndex((req) => req.requestId === requestId);
  if (index === -1) return;

  const request = networkRequests[index];

  // Calculate request duration
  request.time = Math.round(details.timeStamp - request.startTime);

  // Update status if not set
  if (!request.status) {
    request.status = details.statusCode;
  }

  // Update response headers if needed
  if (
    details.responseHeaders &&
    Object.keys(request.responseHeaders).length === 0
  ) {
    const headers = {};
    details.responseHeaders.forEach((header) => {
      headers[header.name] = header.value;
    });
    request.responseHeaders = headers;
  }

  // Cap the size of stored requests
  if (networkRequests.length > 1000) {
    networkRequests = networkRequests.slice(-1000);
  }
}

// Handle request error
function handleError(details) {
  const requestId = details.requestId;

  const index = networkRequests.findIndex((req) => req.requestId === requestId);
  if (index === -1) return;

  const request = networkRequests[index];

  // Mark as error
  request.error = details.error;
  request.status = 0; // Use 0 for errors

  // Calculate duration if possible
  if (request.startTime) {
    request.time = Math.round(details.timeStamp - request.startTime);
  }
}

// Handle messages from popup
function handleMessage(message, sender, sendResponse) {
  if (message.action === "getNetworkRequests") {
    sendResponse({ requests: networkRequests });
  } else if (message.action === "clearNetworkRequests") {
    networkRequests = [];
    requestCounter = 0;
    sendResponse({ success: true });
  }

  return true; // Indicates async response
}

// Initialize on load
init();

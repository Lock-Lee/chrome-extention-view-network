# View Network

A Chrome extension for monitoring network requests with size, time, and error information, with cURL export capability.

## Features

- Track all network requests made by the browser
- Display request details including:
  - HTTP method
  - URL
  - Response size (ขนาด)
  - Response time (เวลา)
  - HTTP status code (สถานะ)
- View request and response headers
- View request and response bodies
- Filter requests by URL, method, or status
- Export request data as JSON
- Copy requests as cURL commands
- Color-coded status codes for easy error identification
- Support for all HTTP methods

> Note: This extension uses Manifest V3 and can observe network requests but cannot block or modify them.

## Installation

### Loading the unpacked extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" by clicking the toggle switch in the top right corner
3. Click "Load unpacked" button and select the extension folder
4. The extension should now appear in your browser toolbar

## Usage

1. Click on the View Network icon in your browser toolbar to open the popup, or use the keyboard shortcut:
   - **Ctrl+Shift+M** (Windows/Linux)
   - **Command+Shift+M** (macOS)
2. Browse websites and watch network requests populate in real-time
3. Click on any request to see detailed information
4. Use the filter box to search for specific requests
5. Click "Export JSON" to save the current network requests to a file
6. Click "Copy cURL Command" in the details view to copy a request as a cURL command
7. Click "Clear" to remove all captured requests

## Tab Sections

### Requests

Shows a table of all captured network requests with basic information.

### Details

Displays detailed information about a selected request, including:

- General information
- Request headers
- Request body
- Response headers
- Response body
- cURL command generation

## License

MIT
# Mr. KeeYed Extension - Important Note

In order to load this extension in Chrome, please follow these steps:

1. Fix the SVG icons by converting them to PNG format. The extension includes SVG files in the `/icons` folder, but Chrome requires actual PNG files. You can use any image converter tool to convert them.

2. This extension uses Manifest V3, which has some limitations compared to older extensions:
   - It can only observe network requests, not modify or block them
   - Access to response bodies is limited in Manifest V3

3. If you need to debug the extension:
   - Open Chrome DevTools for the extension by right-clicking the extension icon and selecting "Inspect"
   - View console logs and errors to troubleshoot issues

4. Keyboard shortcuts:
   - You can quickly open the extension using:
     - **Ctrl+Shift+M** on Windows and Linux
     - **Command+Shift+M** on macOS
   - If you want to customize these shortcuts, go to chrome://extensions/shortcuts

5. If you encounter any issues with the extension not properly capturing network requests, try reloading the extension and reopening the browser.

Happy network monitoring!
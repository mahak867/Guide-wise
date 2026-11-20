# Check with Guidewise (Chrome extension)

Check a draft where you write it. Select the text in LinkedIn, Gmail, X or any page, click the Guidewise button in the toolbar, and the popup shows the verdict and each cited finding: the rule, the exact words, what is wrong and a suggested fix with a **Copy fix** button. It uses the public REST API (`POST /api/v1/check`, see [docs/API.md](../docs/API.md)), so you get the same findings as the app.

## Install (about a minute)

1. Download this `extension` folder: on GitHub, **Code → Download ZIP**, then unzip it.
2. In Chrome (or Edge, Brave), open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `extension` folder. Pin "Check with Guidewise" from the puzzle-piece menu.

Then create a key: on the Guidewise **API** page, act as the brand manager and create a key with the `draft:check` scope. Open the extension, paste the key in **Settings** and click **Save settings**.

## Use

- Select the draft on the page and click the toolbar button. The selection fills the box (text selected inside a text box works too); click **Check selected text**.
- Or paste a draft in the box and click **Check text in the box**.
- Choose the content type (social post, ad, email, landing page, document) and whether to run the **AI checks** as well (slower; the code checks always run).
- Browser pages (`chrome://…`) and the Chrome Web Store cannot be read by any extension: paste the text instead.

## What it can reach

| Permission | Why |
| --- | --- |
| `activeTab` + `scripting` | Read the selected text of the tab you clicked the button on, only when you click it. No access to any page otherwise; no content scripts. |
| `storage` | Keep the site address, key and preferences in `chrome.storage.local` (this browser only; never synced). |
| Host `https://guidewise-kohl.vercel.app/*` | Call the Guidewise API. |
| Optional hosts | Only if you set your own Guidewise site (for example `http://localhost:3000`): Chrome asks you to allow that one origin when you save. |

The key is sent only to the site in Settings, as `Authorization: Bearer gw_…`, without cookies. The extension never writes the key or your draft to the console and sends nothing anywhere else. Results are shown as text only: nothing from the server is inserted as HTML.

### Why no server change was needed

A request from an extension page (the popup) to an origin listed in the extension's host permissions is not subject to CORS in Chrome, so the API does not send any `Access-Control-Allow-Origin` header and web pages still cannot call it from a browser with someone's key. Content scripts, by contrast, are subject to the page's CORS rules, which is why the call is made from the popup, not from the page.

### Why not a bookmarklet

A bookmarklet runs as part of the page you are on, so its requests are bound by that page's Content-Security-Policy (sites such as LinkedIn, Gmail and X only allow connections to their own servers) and by CORS (the Guidewise API does not accept cross-origin calls from web pages, and should not, since the key would then work from any site). Depending on the browser, the page's CSP can also stop the bookmarklet from running at all. It would be unreliable on exactly the sites where people write. The extension's popup runs in its own page, so none of this applies.

## Develop

- `extension/check.js` holds the logic (request, response, rendering) with no Chrome APIs; `tests/extension.test.ts` tests it with Vitest (`npm test`).
- `e2e/extension.mjs` loads the unpacked extension in Playwright's Chromium and checks a selection on a local page against a live site: `BASE_URL=https://guidewise-kohl.vercel.app NODE_USE_ENV_PROXY=1 node e2e/extension.mjs`.
- `node scripts/make-extension-icons.mjs` redraws the icons.

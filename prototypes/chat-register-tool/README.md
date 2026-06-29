# Chat-based Register a Tool — Prototype

Single-file React prototype (`App.jsx`) with Tailwind CDN. No backend, no build step.

## Run

From this folder:

```bash
npx serve .
# or: python3 -m http.server 3456
```

Open the URL shown (e.g. http://localhost:3000) — **do not** open `index.html` directly (`file://` blocks Babel from loading `App.jsx`).

## Try it

Paste a rich first message to see multi-field extraction:

```
It's called Weather Lookup — a Data tool that returns forecasts for a city.
Endpoint is https://api.internal.headout/weather. Auth is API key. Free for internal use.
Inputs: city (string), date (date)
```

Or answer step-by step. Use quick-reply chips for auth/category. Correct with e.g. `actually the name is Forecast API`.

Click **Register tool** when the preview shows all required fields filled. Check the browser console for the final JSON.

# Station House Fire Sheet V2

An independent, browser-based prototype of Station House BBQ's operations and CRM hub.

## Included in this checkpoint

- Branded eight-module operations hub
- Public weekend Fire Drop menu and demo checkout
- 7.5% tax calculation and simulated order confirmation
- Seminole Heights active pickup dashboard and searchable history
- Catering lead Kanban with source attribution and drag-and-drop stages
- Browser-local demo data; no live payments, credentials, or production data
- Responsive layout for desktop, tablet, and mobile

## Run locally

No build tools are required. Open `index.html` in a browser, or run a simple static server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Publish with GitHub Pages

1. Upload all files in this folder to the repository root.
2. In GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**.
4. Select `main`, folder `/ (root)`, then **Save**.

The project intentionally contains no payment credentials or customer production data.

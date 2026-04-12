# MockDock

**Instant mock backend for frontend developers. Zero code change.**

Paste one script tag into your HTML. Your existing `fetch()` calls return the data you defined. Remove the tag when your real backend is ready. Nothing else in your code ever changes.

🔗 **Live Demo:** https://mockdoc-1.onrender.com

---

## The Problem

Frontend and backend development rarely happen in sync. While the backend is being built, frontend developers are stuck either hardcoding fake data into components or waiting. Both options are bad.

Most mock tools require you to change your fetch URLs, update your API base, or reconfigure your code to point at a local server — then change everything back when you're done. That friction is enough to make most developers just wait.

MockDock removes that friction entirely.

---

## How It Works

1. **Choose a namespace** — pick a name like `team-demo`. MockDock checks availability live as you type.
2. **Define your resources** — name each resource, set the route your frontend already calls, paste a JSON schema.
3. **Seed records** — paste a JSON array of the actual data you want your frontend to receive.
4. **Get your script tag** — one line. Paste it into your HTML before your own scripts.
5. **Test** — your `fetch('/api/users')` now returns real data with no changes to your code.
6. **Remove the tag** — when your real backend is ready, delete the one line. Done.

---

## Schema Format

MockDock uses a flat JSON object where keys are field names and values are type definitions.

**Supported types:**

```json
{
  "name": "string",
  "age": "integer",
  "price": "number",
  "active": "boolean",
  "email": { "type": "string", "format": "email" },
  "role": { "enum": ["admin", "user", "guest"] }
}
```

**Records — paste as a JSON array:**

```json
[
  { "name": "Alice", "age": 30, "email": "alice@example.com", "role": "admin" },
  { "name": "Bob",   "age": 25, "email": "bob@example.com",   "role": "user"  }
]
```

---

## Multiple Resources

One namespace is a full mini backend. Add as many resources as you need before generating — each gets its own schema, its own records, and its own independent endpoints.

```
GET    /myteam/users
GET    /myteam/posts
GET    /myteam/comments
```

---

## Script Tag

MockDock generates a script tag like this:

```html
<script src="https://mockdoc-1.onrender.com/interceptor/myteam.js"></script>
```

Paste it into your HTML — anywhere before your own scripts. Your frontend code does not change at all.

```javascript
// Your code — unchanged
fetch('/api/users')
  .then(res => res.json())
  .then(data => console.log(data))
// → Returns your seeded records
```

When your real backend is ready, delete the script tag. That is the entire reversal.

---

## Validation

Every POST and PUT request is validated against the schema. If a field has the wrong type, is missing, or is not defined in the schema at all, the request is rejected immediately with a specific error:

```
field 'age' expects integer
field 'email' expects a valid email address
field 'role' must be one of: admin, user, guest
field 'nickname' is not defined in schema
field 'name' is required
```

Nothing passes silently.

---

## Auth Flow

MockDock can fake a login-protected API. Enable the auth toggle and configure:

- **Login route** — e.g. `POST /api/login` → returns `{ "token": "your_token" }`
- **Protected routes** — routes that require `Authorization: Bearer your_token`
- Missing or wrong token → `401 Unauthorized`

The interceptor handles this automatically. Your frontend login flow works end to end without a real backend.

---

## Live CRUD Endpoints

In addition to the interceptor, MockDock exposes direct REST endpoints:

```
GET    /<namespace>/<resource>          → list all records
GET    /<namespace>/<resource>/<id>     → get one record
POST   /<namespace>/<resource>          → create record
PUT    /<namespace>/<resource>/<id>     → update record
DELETE /<namespace>/<resource>/<id>     → delete record
DELETE /<namespace>/<resource>/records  → reset all records
```

Pre-filled curl commands and fetch snippets for all endpoints are available in the output panel with copy buttons.

---

## Output Panel

After generating, the output panel shows:

- Script tag with copy button
- Schema summary per resource
- Access token if auth is enabled
- Expiry time
- All endpoints with curl commands and fetch snippets
- Health indicator per resource — green means last request succeeded, red means failed or untested
- Reset Records button per resource
- Inline API tester — select an endpoint, send a request, see the response
- Request logs — method, route, status, response time, time ago — polling every 10 seconds

---

## TTL

Every namespace expires **24 hours** after creation. Expired namespaces return `410 Gone` on all direct endpoints. The interceptor for an expired namespace silently passes all fetch calls through to the real network.

---

## Run Locally

```bash
git clone https://github.com/RautelaSahil/MOCKDOC.git
cd MOCKDOC
pip install flask gunicorn
python app.py
```

Open `http://localhost:5000`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3, Flask |
| Database | SQLite |
| Frontend | HTML, CSS, Vanilla JavaScript |
| Hosting | Render |

Dependencies: `flask` and `gunicorn` only. Everything else is Python standard library.

---

## Project Structure

```
mockdock/
├── app.py                    ← Flask entry point, CORS, blueprint registration
├── db.py                     ← SQLite connection, migrations, all query helpers
├── routes/
│   ├── create.py             ← POST /api/create
│   ├── mock.py               ← CRUD endpoints, schema validation
│   ├── namespace.py          ← GET /<slug>/check
│   ├── logs.py               ← GET /<slug>/logs, GET /<slug>/health
│   └── interceptor.py        ← GET /interceptor/<slug>.js
├── middleware/
│   └── request_logger.py     ← logs every CRUD request
├── static/
│   ├── index.html
│   ├── style.css
│   └── script.js
└── mockdock.db               ← auto-created on first run
```

---

## What MockDock Does Not Do

- No user accounts or login
- No data beyond 24 hours
- No file uploads
- No real-time sync
- No CLI — browser only
- Not a replacement for a real backend — only the waiting period before one exists

---

Built for Watch the Code 2026 — Graphic Era Hill University

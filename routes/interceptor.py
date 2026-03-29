import json
from datetime import datetime, timezone
from flask import Blueprint, make_response
from db import get_namespace, get_schema, get_records, get_auth_config

interceptor_bp = Blueprint("interceptor", __name__)


def is_expired(expires_at: str) -> bool:
    expiry = datetime.strptime(expires_at, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) > expiry


def build_pass_through_js():
    """Returns a minimal interceptor JS that passes all fetch calls through untouched."""
    return """(function() {
  // MockDock interceptor — namespace not found or expired. All fetch calls pass through.
})();
"""


def build_interceptor_js(route_map, auth_config):
    """
    Builds the full interceptor JS string.

    route_map structure:
    {
      "/api/users": {
        "base_route": "/api/users",
        "records": [...],
        "schema": { "name": "string", ... },
        "auth_required": false
      },
      ...
    }

    auth_config structure (or null):
    {
      "login_route": "/api/login",
      "token": "mock_abc123",
      "protected_routes": ["/api/users"]
    }
    """
    route_map_json = json.dumps(route_map, indent=2)
    auth_config_json = json.dumps(auth_config) if auth_config else "null"

    return f"""(function() {{
  var _originalFetch = window.fetch.bind(window);
  var _routeMap = {route_map_json};
  var _authConfig = {auth_config_json};

  // In-memory store for records added during this session via POST
  var _sessionRecords = {{}};

  function _extractPath(url) {{
    try {{
      var parsed = new URL(url, window.location.origin);
      return parsed.pathname;
    }} catch (e) {{
      return url.split('?')[0];
    }}
  }}

  function _mockResponse(body, status) {{
    return new Response(JSON.stringify(body), {{
      status: status || 200,
      headers: {{ 'Content-Type': 'application/json' }}
    }});
  }}

  function _checkAuth(routePath, requestInit) {{
    if (!_authConfig) return true;
    if (_authConfig.protected_routes.indexOf(routePath) === -1) return true;
    var headers = (requestInit && requestInit.headers) || {{}};
    var authHeader = headers['Authorization'] || headers['authorization'] || '';
    return authHeader === 'Bearer ' + _authConfig.token;
  }}

  function _getRecords(baseRoute) {{
    var session = _sessionRecords[baseRoute];
    var stored = (_routeMap[baseRoute] && _routeMap[baseRoute].records) || [];
    if (session) {{
      return stored.concat(session);
    }}
    return stored.slice();
  }}

  window.fetch = function(input, init) {{
    var url = (typeof input === 'string') ? input : input.url;
    var method = ((init && init.method) || 'GET').toUpperCase();
    var path = _extractPath(url);

    // --- Tier 1: Exact match (GET, POST) ---
    if (_routeMap[path]) {{
      var route = _routeMap[path];

      // Auth login route (POST to login_route)
      if (_authConfig && path === _authConfig.login_route && method === 'POST') {{
        return Promise.resolve(_mockResponse({{ token: _authConfig.token }}));
      }}

      // Auth check
      if (!_checkAuth(path, init)) {{
        return Promise.resolve(_mockResponse({{ error: 'unauthorized' }}, 401));
      }}

      if (method === 'GET') {{
        var records = _getRecords(path);
        return Promise.resolve(_mockResponse(records));
      }}

      if (method === 'POST') {{
        var body = {{}};
        try {{ body = JSON.parse((init && init.body) || '{{}}'); }} catch(e) {{}}

        // Assign a temporary session id
        var sessionId = 'session_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        body.id = sessionId;

        if (!_sessionRecords[path]) _sessionRecords[path] = [];
        _sessionRecords[path].push(body);

        return Promise.resolve(_mockResponse(body, 201));
      }}
    }}

    // --- Tier 2: Prefix + ID match (PUT, DELETE) ---
    if (method === 'PUT' || method === 'DELETE') {{
      var matchedBase = null;
      var recordId = null;

      var keys = Object.keys(_routeMap);
      for (var i = 0; i < keys.length; i++) {{
        var base = keys[i];
        if (path.startsWith(base + '/')) {{
          var trailing = path.slice(base.length + 1);
          if (trailing && trailing.indexOf('/') === -1) {{
            matchedBase = base;
            recordId = trailing;
            break;
          }}
        }}
      }}

      if (matchedBase) {{
        // Auth check
        if (!_checkAuth(matchedBase, init)) {{
          return Promise.resolve(_mockResponse({{ error: 'unauthorized' }}, 401));
        }}

        if (method === 'PUT') {{
          var putBody = {{}};
          try {{ putBody = JSON.parse((init && init.body) || '{{}}'); }} catch(e) {{}}
          putBody.id = recordId;
          return Promise.resolve(_mockResponse(putBody));
        }}

        if (method === 'DELETE') {{
          return Promise.resolve(_mockResponse({{ deleted: true, id: recordId }}));
        }}
      }}
    }}

    // --- No match: pass through to original fetch ---
    return _originalFetch(input, init);
  }};

}})();
"""


@interceptor_bp.route("/interceptor/<namespace_js>")
def serve_interceptor(namespace_js):
    # Strip the .js extension
    if not namespace_js.endswith(".js"):
        slug = namespace_js
    else:
        slug = namespace_js[:-3]

    ns = get_namespace(slug)

    # Expired or missing → pass-through JS
    if not ns or is_expired(ns["expires_at"]):
        js = build_pass_through_js()
        response = make_response(js, 200)
        response.headers["Content-Type"] = "application/javascript"
        return response

    # Fetch schema, records, and auth
    schema = get_schema(slug)
    records = get_records(slug)
    auth = get_auth_config(slug)

    route_path = ns["route_path"]

    route_map = {
        route_path: {
            "base_route": route_path,
            "records": records,
            "schema": schema,
        }
    }

    # If auth exists, register the login route as a known route
    if auth:
        route_map[auth["login_route"]] = {
            "base_route": auth["login_route"],
            "records": [],
            "schema": {},
        }

    auth_config_for_js = None
    if auth:
        auth_config_for_js = {
            "login_route": auth["login_route"],
            "token": auth["token"],
            "protected_routes": auth["protected_routes"],
        }

    js = build_interceptor_js(route_map, auth_config_for_js)
    response = make_response(js, 200)
    response.headers["Content-Type"] = "application/javascript"
    return response
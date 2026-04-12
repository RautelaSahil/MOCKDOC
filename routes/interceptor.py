import json
from datetime import datetime, timezone

from flask import Blueprint, make_response

from db import get_auth_config, get_namespace, get_records, get_resources_by_namespace, get_schema_json

interceptor_bp = Blueprint("interceptor", __name__)


def is_expired(expires_at: str) -> bool:
    normalized = expires_at.replace("Z", "+00:00")
    expiry = datetime.fromisoformat(normalized)
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) > expiry


def build_pass_through_js():
    return """(function() {
  // MockDock interceptor â€” namespace not found or expired. All fetch calls pass through.
})();
"""


def build_interceptor_js(route_map, auth_config):
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

    if (_routeMap[path]) {{
      if (_authConfig && path === _authConfig.login_route && method === 'POST') {{
        return Promise.resolve(_mockResponse({{ token: _authConfig.token }}));
      }}

      if (!_checkAuth(path, init)) {{
        return Promise.resolve(_mockResponse({{ error: 'unauthorized' }}, 401));
      }}

      if (method === 'GET') {{
        return Promise.resolve(_mockResponse(_getRecords(path)));
      }}

      if (method === 'POST') {{
        var body = {{}};
        try {{ body = JSON.parse((init && init.body) || '{{}}'); }} catch(e) {{}}

        var sessionId = 'session_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        body.id = sessionId;

        if (!_sessionRecords[path]) _sessionRecords[path] = [];
        _sessionRecords[path].push(body);

        return Promise.resolve(_mockResponse(body, 201));
      }}
    }}

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

    return _originalFetch(input, init);
  }};

}})();
"""


@interceptor_bp.route("/interceptor/<namespace_js>")
def serve_interceptor(namespace_js):
    slug = namespace_js[:-3] if namespace_js.endswith(".js") else namespace_js
    ns = get_namespace(slug)

    if not ns or is_expired(ns["expires_at"]):
        js = build_pass_through_js()
        response = make_response(js, 200)
        response.headers["Content-Type"] = "application/javascript"
        return response

    auth = get_auth_config(slug)
    resources = get_resources_by_namespace(slug)
    route_map = {}

    for resource in resources:
        route_map[resource["route_path"]] = {
            "base_route": resource["route_path"],
            "records": get_records(resource["id"]),
            "schema": get_schema_json(resource["id"]),
        }

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

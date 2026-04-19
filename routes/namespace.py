from flask import Blueprint, jsonify, request
from db import is_slug_available, get_namespace, get_resources_by_namespace, get_auth_config
import json

namespace_bp = Blueprint("namespace", __name__)

@namespace_bp.route("/<slug>/check", methods=["GET"])
def check_slug(slug):
    return jsonify({
        "slug": slug,
        "available": is_slug_available(slug)
    }), 200


@namespace_bp.route("/api/namespace/<slug>", methods=["GET"])
def get_namespace_api(slug):
    if is_slug_available(slug):
        return jsonify({"error": "API not found or expired"}), 404

    resources = get_resources_by_namespace(slug)
    host = request.host_url.rstrip('/')

    res_list = []
    for r in resources:
        schema = {}
        try:
            schema = json.loads(r.get("schema_json", "{}"))
        except:
            pass

        route = r["route_path"].lstrip('/')
        res_list.append({
            "name": r["name"],
            "route_path": r["route_path"],
            "full_url": f"{host}/api/namespace/{slug}/{route}",
            "schema": schema
        })

    auth_config = get_auth_config(slug)
    if auth_config:
        auth_out = {
            "login_route": auth_config.get("login_route"),
            "token": auth_config.get("token"),
            "protected_routes": auth_config.get("protected_routes", [])
        }
    else:
        auth_out = None

    return jsonify({
        "namespace": slug,
        "base_url": f"{host}/api/namespace/{slug}",
        "interceptor_tag": f'<script src="{host}/interceptor/{slug}.js"></script>',
        "resources": res_list,
        "auth": auth_out
    }), 200

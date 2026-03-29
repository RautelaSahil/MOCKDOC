from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from db import (
    get_namespace, get_schema, get_records, get_record_by_id,
    insert_records, update_record, delete_record, get_auth_config
)

mock_bp = Blueprint("mock", __name__)


# --- Helpers ---

def is_expired(expires_at: str) -> bool:
    expiry = datetime.strptime(expires_at, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) > expiry


def check_namespace(slug):
    """
    Returns (namespace_dict, error_response) tuple.
    If namespace is missing or expired, error_response is set.
    """
    ns = get_namespace(slug)
    if not ns:
        return None, (jsonify({"error": "namespace not found"}), 404)
    if is_expired(ns["expires_at"]):
        return None, (jsonify({"error": "this namespace has expired"}), 410)
    return ns, None


def check_auth(slug, route_path):
    """
    Returns error response tuple if auth fails, or None if auth passes / not required.
    """
    auth = get_auth_config(slug)
    if not auth:
        return None
    if route_path not in auth.get("protected_routes", []):
        return None

    auth_header = request.headers.get("Authorization", "")
    expected = f"Bearer {auth.get('token')}"
    if auth_header != expected:
        return jsonify({"error": "unauthorized"}), 401

    return None


def validate_and_coerce(data: dict, schema: dict):
    """
    Validate field types against schema.
    Returns (coerced_dict, error_string).
    """
    coerced = {}
    for field_name, field_type in schema.items():
        value = data.get(field_name)
        if value is None:
            return None, f"field '{field_name}' is missing"

        if field_type == "number":
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                return None, f"field '{field_name}' expects number, got {type(value).__name__}"
            coerced[field_name] = value
        elif field_type == "boolean":
            if not isinstance(value, bool):
                return None, f"field '{field_name}' expects boolean, got {type(value).__name__}"
            coerced[field_name] = value
        elif field_type == "string":
            coerced[field_name] = str(value)

    return coerced, None


# --- GET /<namespace>/<resource> ---

@mock_bp.route("/<slug>/<resource>", methods=["GET"])
def list_records(slug, resource):
    ns, err = check_namespace(slug)
    if err is not None:
        return err
    if ns is None:  # Guard clause fixes the linter red line
        return jsonify({"error": "namespace not found"}), 404

    if ns.get("resource_name") != resource:
        return jsonify({"error": "resource not found"}), 404

    auth_err = check_auth(slug, ns.get("route_path"))
    if auth_err is not None:
        return auth_err

    records = get_records(slug)
    return jsonify(records), 200


# --- POST /<namespace>/<resource> ---

@mock_bp.route("/<slug>/<resource>", methods=["POST"])
def create_record(slug, resource):
    ns, err = check_namespace(slug)
    if err is not None:
        return err
    if ns is None:
        return jsonify({"error": "namespace not found"}), 404

    if ns.get("resource_name") != resource:
        return jsonify({"error": "resource not found"}), 404

    auth_err = check_auth(slug, ns.get("route_path"))
    if auth_err is not None:
        return auth_err

    body = request.get_json(silent=True)
    if not isinstance(body, dict): # Proves to linter that body is a dict
        return jsonify({"error": "request body must be a valid JSON object"}), 400

    schema = get_schema(slug)
    if not schema:
        return jsonify({"error": "schema not found"}), 404

    coerced, error = validate_and_coerce(body, schema)
    if error is not None:
        return jsonify({"error": error}), 400
    if coerced is None:
        return jsonify({"error": "validation failed"}), 400

    insert_records(slug, [coerced])

    # Fetch the newly inserted record
    all_records = get_records(slug)
    if not all_records:
        return jsonify({"error": "failed to retrieve new record"}), 500
        
    new_record = all_records[-1]
    return jsonify(new_record), 201


# --- PUT /<namespace>/<resource>/<id> ---

@mock_bp.route("/<slug>/<resource>/<int:record_id>", methods=["PUT"])
def update_record_route(slug, resource, record_id):
    ns, err = check_namespace(slug)
    if err is not None:
        return err
    if ns is None:
        return jsonify({"error": "namespace not found"}), 404

    if ns.get("resource_name") != resource:
        return jsonify({"error": "resource not found"}), 404

    auth_err = check_auth(slug, ns.get("route_path"))
    if auth_err is not None:
        return auth_err

    existing = get_record_by_id(slug, record_id)
    if not existing:
        return jsonify({"error": f"record with id {record_id} not found"}), 404

    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"error": "request body must be a valid JSON object"}), 400

    schema = get_schema(slug)
    if not schema:
        return jsonify({"error": "schema not found"}), 404

    coerced, error = validate_and_coerce(body, schema)
    if error is not None:
        return jsonify({"error": error}), 400
    if coerced is None:
        return jsonify({"error": "validation failed"}), 400

    update_record(slug, record_id, coerced)

    updated = get_record_by_id(slug, record_id)
    return jsonify(updated), 200


# --- DELETE /<namespace>/<resource>/<id> ---

@mock_bp.route("/<slug>/<resource>/<int:record_id>", methods=["DELETE"])
def delete_record_route(slug, resource, record_id):
    ns, err = check_namespace(slug)
    if err is not None:
        return err
    if ns is None:
        return jsonify({"error": "namespace not found"}), 404

    if ns.get("resource_name") != resource:
        return jsonify({"error": "resource not found"}), 404

    auth_err = check_auth(slug, ns.get("route_path"))
    if auth_err is not None:
        return auth_err

    existing = get_record_by_id(slug, record_id)
    if not existing:
        return jsonify({"error": f"record with id {record_id} not found"}), 404

    delete_record(slug, record_id)
    return jsonify({"deleted": True, "id": record_id}), 200
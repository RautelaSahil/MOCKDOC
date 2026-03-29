import secrets
from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify
from db import (
    slug_exists, insert_namespace, insert_schema_fields,
    insert_records, insert_auth_config
)

create_bp = Blueprint("create", __name__)

VALID_TYPES = {"string", "number", "boolean"}


def generate_slug():
    for _ in range(5):
        slug = secrets.token_urlsafe(5)
        if not slug_exists(slug):
            return slug
    return None


def validate_request(body):
    """Validate the incoming POST /api/create body. Returns error string or None."""
    resource = body.get("resource", "").strip()
    if not resource:
        return "resource name cannot be empty"

    route = body.get("route", "").strip()
    if not route:
        return "route path must start with /"
    if not route.startswith("/"):
        return "route path must start with /"

    schema = body.get("schema")
    if not schema or not isinstance(schema, dict) or len(schema) == 0:
        return "schema must have at least one field"

    for field_name, field_type in schema.items():
        if field_type not in VALID_TYPES:
            return f"field '{field_name}' has invalid type '{field_type}'. Must be string, number, or boolean"

    records = body.get("records")
    if not records or not isinstance(records, list) or len(records) == 0:
        return "at least one record must be seeded"

    return None


def coerce_record(record, schema):
    """
    Coerce record values to match schema types.
    Returns (coerced_record, error_string).
    """
    coerced = {}
    for field_name, field_type in schema.items():
        value = record.get(field_name)
        if value is None:
            return None, f"field '{field_name}' is missing from record"

        if field_type == "string":
            coerced[field_name] = str(value)
        elif field_type == "number":
            if not isinstance(value, (int, float)):
                return None, f"field '{field_name}' expects number, got {type(value).__name__}"
            coerced[field_name] = value
        elif field_type == "boolean":
            if not isinstance(value, bool):
                return None, f"field '{field_name}' expects boolean, got {type(value).__name__}"
            coerced[field_name] = value

    return coerced, None


@create_bp.route("/api/create", methods=["POST"])
def create():
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "request body must be valid JSON"}), 400

    error = validate_request(body)
    if error:
        return jsonify({"error": error}), 400

    resource = body["resource"].strip()
    route = body["route"].strip()
    schema = body["schema"]
    records = body["records"]
    auth = body.get("auth")  # optional

    # Validate and coerce all records against schema
    coerced_records = []
    for i, record in enumerate(records):
        coerced, err = coerce_record(record, schema)
        if err:
            return jsonify({"error": f"record {i + 1}: {err}"}), 400
        coerced_records.append(coerced)

    # Generate unique slug
    slug = generate_slug()
    if not slug:
        return jsonify({"error": "failed to generate unique namespace, please try again"}), 500

    # Calculate expiry is 24 hours from now
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Write to DB
    insert_namespace(slug, resource, route, expires_at)
    insert_schema_fields(slug, schema)
    insert_records(slug, coerced_records)

    if auth:
        login_route = auth.get("login_route", "").strip()
        token = auth.get("token", "").strip()
        protected_routes = auth.get("protected_routes", [])
        if login_route and token:
            insert_auth_config(slug, login_route, token, protected_routes)

    # Build response
    base_url = "http://localhost:5000"
    interceptor_tag = f'<script src="{base_url}/interceptor/{slug}.js"></script>'

    return jsonify({
        "namespace": slug,
        "resource": resource,
        "route": route,
        "expires_at": expires_at,
        "interceptor_tag": interceptor_tag,
        "endpoints": {
            "list":   f"GET    {base_url}/{slug}/{resource}",
            "create": f"POST   {base_url}/{slug}/{resource}",
            "update": f"PUT    {base_url}/{slug}/{resource}/<id>",
            "delete": f"DELETE {base_url}/{slug}/{resource}/<id>",
        }
    }), 200
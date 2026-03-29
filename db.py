import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "mockdock.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS namespaces (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT NOT NULL UNIQUE,
            resource_name TEXT NOT NULL,
            route_path TEXT NOT NULL,
            expires_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS schemas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            namespace_slug TEXT NOT NULL,
            field_name TEXT NOT NULL,
            field_type TEXT NOT NULL,
            FOREIGN KEY (namespace_slug) REFERENCES namespaces(slug)
        );

        CREATE TABLE IF NOT EXISTS records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            namespace_slug TEXT NOT NULL,
            data TEXT NOT NULL,
            FOREIGN KEY (namespace_slug) REFERENCES namespaces(slug)
        );

        CREATE TABLE IF NOT EXISTS auth_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            namespace_slug TEXT NOT NULL UNIQUE,
            login_route TEXT NOT NULL,
            token TEXT NOT NULL,
            protected_routes TEXT NOT NULL,
            FOREIGN KEY (namespace_slug) REFERENCES namespaces(slug)
        );
    """)

    conn.commit()
    conn.close()


# --- Namespace helpers ---

def insert_namespace(slug, resource_name, route_path, expires_at):
    conn = get_connection()
    conn.execute(
        "INSERT INTO namespaces (slug, resource_name, route_path, expires_at) VALUES (?, ?, ?, ?)",
        (slug, resource_name, route_path, expires_at)
    )
    conn.commit()
    conn.close()


def get_namespace(slug):
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM namespaces WHERE slug = ?", (slug,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def slug_exists(slug):
    conn = get_connection()
    row = conn.execute(
        "SELECT id FROM namespaces WHERE slug = ?", (slug,)
    ).fetchone()
    conn.close()
    return row is not None


# Schema helpers

def insert_schema_fields(namespace_slug, fields: dict):
    conn = get_connection()
    for field_name, field_type in fields.items():
        conn.execute(
            "INSERT INTO schemas (namespace_slug, field_name, field_type) VALUES (?, ?, ?)",
            (namespace_slug, field_name, field_type)
        )
    conn.commit()
    conn.close()


def get_schema(namespace_slug):
    conn = get_connection()
    rows = conn.execute(
        "SELECT field_name, field_type FROM schemas WHERE namespace_slug = ?",
        (namespace_slug,)
    ).fetchall()
    conn.close()
    return {row["field_name"]: row["field_type"] for row in rows}


# Record helpers

def insert_records(namespace_slug, records: list):
    import json
    conn = get_connection()
    for record in records:
        conn.execute(
            "INSERT INTO records (namespace_slug, data) VALUES (?, ?)",
            (namespace_slug, json.dumps(record))
        )
    conn.commit()
    conn.close()


def get_records(namespace_slug):
    import json
    conn = get_connection()
    rows = conn.execute(
        "SELECT id, data FROM records WHERE namespace_slug = ?",
        (namespace_slug,)
    ).fetchall()
    conn.close()
    result = []
    for row in rows:
        record = json.loads(row["data"])
        record["id"] = row["id"]
        result.append(record)
    return result


def get_record_by_id(namespace_slug, record_id):
    import json
    conn = get_connection()
    row = conn.execute(
        "SELECT id, data FROM records WHERE namespace_slug = ? AND id = ?",
        (namespace_slug, record_id)
    ).fetchone()
    conn.close()
    if row:
        record = json.loads(row["data"])
        record["id"] = row["id"]
        return record
    return None


def update_record(namespace_slug, record_id, new_data: dict):
    import json
    conn = get_connection()
    conn.execute(
        "UPDATE records SET data = ? WHERE namespace_slug = ? AND id = ?",
        (json.dumps(new_data), namespace_slug, record_id)
    )
    conn.commit()
    conn.close()


def delete_record(namespace_slug, record_id):
    conn = get_connection()
    conn.execute(
        "DELETE FROM records WHERE namespace_slug = ? AND id = ?",
        (namespace_slug, record_id)
    )
    conn.commit()
    conn.close()


# Auth config helpers

def insert_auth_config(namespace_slug, login_route, token, protected_routes: list):
    import json
    conn = get_connection()
    conn.execute(
        "INSERT INTO auth_config (namespace_slug, login_route, token, protected_routes) VALUES (?, ?, ?, ?)",
        (namespace_slug, login_route, token, json.dumps(protected_routes))
    )
    conn.commit()
    conn.close()


def get_auth_config(namespace_slug):
    import json
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM auth_config WHERE namespace_slug = ?",
        (namespace_slug,)
    ).fetchone()
    conn.close()
    if row:
        result = dict(row)
        result["protected_routes"] = json.loads(result["protected_routes"])
        return result
    return None
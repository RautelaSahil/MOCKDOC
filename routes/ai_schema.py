import json
import os
import urllib.request
import urllib.error

from flask import Blueprint, jsonify, request

ai_schema_bp = Blueprint("ai_schema", __name__)

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama3-8b-8192"

SYSTEM_PROMPT = """You are a JSON schema generator for a mock REST API tool called MockDock.

Given a description of a resource, return ONLY a valid JSON object (no markdown, no explanation) 
that represents a MockDock schema. 

MockDock schema rules:
- Each key is a field name
- Values can be:
  - "string"   → plain text field
  - "integer"  → whole number
  - "number"   → decimal number
  - "boolean"  → true/false
  - {"enum": ["val1", "val2"]}  → one of a fixed set of string values
  - {"type": "string", "format": "email"}  → email address field

Example output for "a product with name, price, stock count, and category":
{"name":"string","price":"number","stock":"integer","category":{"enum":["electronics","clothing","food","other"]}}

Return ONLY the raw JSON object. No backticks, no explanation, no extra text."""


def call_groq(prompt: str) -> dict:
    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not api_key:
        raise ValueError("GROQ_API_KEY environment variable is not set")

    payload = json.dumps({
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Generate a MockDock schema for: {prompt}"}
        ],
        "temperature": 0.3,
        "max_tokens": 512,
    }).encode("utf-8")

    req = urllib.request.Request(
        GROQ_API_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=15) as resp:
        body = json.loads(resp.read().decode("utf-8"))

    raw_text = body["choices"][0]["message"]["content"].strip()

    # Strip any accidental markdown fences
    if raw_text.startswith("```"):
        lines = raw_text.splitlines()
        raw_text = "\n".join(
            line for line in lines if not line.startswith("```")
        ).strip()

    schema = json.loads(raw_text)
    if not isinstance(schema, dict) or len(schema) == 0:
        raise ValueError("AI returned an empty or invalid schema object")

    return schema


@ai_schema_bp.route("/api/generate-schema", methods=["POST"])
def generate_schema():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"error": "Request body must be valid JSON"}), 400

    prompt = body.get("prompt", "").strip()
    if not prompt:
        return jsonify({"error": "prompt is required"}), 400

    if len(prompt) > 500:
        return jsonify({"error": "prompt must be 500 characters or fewer"}), 400

    try:
        schema = call_groq(prompt)
        return jsonify({"schema": schema}), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    except urllib.error.HTTPError as e:
        try:
            detail = json.loads(e.read().decode())
            msg = detail.get("error", {}).get("message", str(e))
        except Exception:
            msg = str(e)
        return jsonify({"error": f"Groq API error: {msg}"}), 502

    except urllib.error.URLError as e:
        return jsonify({"error": f"Could not reach Groq API: {e.reason}"}), 502

    except json.JSONDecodeError as e:
        return jsonify({"error": f"AI returned invalid JSON: {e.msg}"}), 502

    except Exception as e:
        return jsonify({"error": f"Unexpected error: {str(e)}"}), 500

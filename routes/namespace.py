from flask import Blueprint, jsonify

from db import is_slug_available

namespace_bp = Blueprint("namespace", __name__)


@namespace_bp.route("/<slug>/check", methods=["GET"])
def check_slug(slug):
    return jsonify({
        "slug": slug,
        "available": is_slug_available(slug)
    }), 200

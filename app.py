from flask import Flask
from db import init_db

app = Flask(__name__, static_folder="static", static_url_path="")


# CORS headers on every response
@app.after_request
def apply_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response


@app.route("/options-handler", methods=["OPTIONS"])
def options_handler():
    return "", 204


# Blueprints 
from routes.create import create_bp
from routes.mock import mock_bp
from routes.interceptor import interceptor_bp

app.register_blueprint(create_bp)
app.register_blueprint(mock_bp)
app.register_blueprint(interceptor_bp)


@app.route("/")
def index():
    return app.send_static_file("index.html")


if __name__ == "__main__":
    init_db()
    app.run(debug=True)
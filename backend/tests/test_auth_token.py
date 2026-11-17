"""STORYBORED_TOKEN gate: open by default, shared-secret when set."""

from fastapi.testclient import TestClient

from storybored.config import Settings
from storybored.main import create_app


def _settings(token: str = "", tmp_path=None) -> Settings:
    return Settings(
        _env_file=None,
        data_dir=str((tmp_path or "/tmp") / "data"),
        storybored_token=token,
    )


def test_open_by_default(tmp_path):
    """No token configured = exactly the old behavior: /api answers plainly."""
    with TestClient(create_app(_settings(tmp_path=tmp_path))) as client:
        assert client.get("/api/projects").status_code == 200


def test_api_rejected_without_token(tmp_path):
    with TestClient(create_app(_settings("s3cret", tmp_path))) as client:
        res = client.get("/api/projects")
        assert res.status_code == 401
        assert res.json()["detail"]  # same {"detail": str} error shape


def test_api_accepts_bearer_header(tmp_path):
    with TestClient(create_app(_settings("s3cret", tmp_path))) as client:
        ok = client.get(
            "/api/projects", headers={"Authorization": "Bearer s3cret"}
        )
        assert ok.status_code == 200


def test_api_accepts_token_query(tmp_path):
    """EventSource and <img> tags can't set headers — query form must work."""
    with TestClient(create_app(_settings("s3cret", tmp_path))) as client:
        assert client.get("/api/projects?token=s3cret").status_code == 200
        assert client.get("/api/projects?token=wrong").status_code == 401


def test_api_accepts_alt_header(tmp_path):
    with TestClient(create_app(_settings("s3cret", tmp_path))) as client:
        ok = client.get("/api/projects", headers={"X-Storybored-Token": "s3cret"})
        assert ok.status_code == 200


def test_static_stays_open(tmp_path):
    """The SPA bundle must load without a token so it can show the prompt."""
    with TestClient(create_app(_settings("s3cret", tmp_path))) as client:
        res = client.get("/")
        assert res.status_code == 200
        assert "text/html" in res.headers["content-type"]

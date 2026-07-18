"""Tests for POST /api/products/bulk"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://catalog-forge-7.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@catalog.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def auth_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return s


def test_bulk_no_auth_returns_401():
    r = requests.post(f"{BASE_URL}/api/products/bulk", json=[{"name": "X"}])
    assert r.status_code == 401


def test_bulk_empty_array_returns_400(auth_session):
    r = auth_session.post(f"{BASE_URL}/api/products/bulk", json=[])
    assert r.status_code == 400


def test_bulk_insert_and_verify(auth_session):
    payload = [
        {"name": "TEST_BULK_Alpha", "category": "TestCat", "price": 19.99, "colors": ["Red", "Blue"]},
        {"name": "TEST_BULK_Beta", "category": "TestCat", "price": 29.90, "colors": ["Green"]},
        {"name": "TEST_BULK_Gamma", "category": "TestCat", "price": 39.00},
    ]
    r = auth_session.post(f"{BASE_URL}/api/products/bulk", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["inserted"] == 3
    assert len(data["ids"]) == 3

    # Verify persistence via GET /api/products
    gr = auth_session.get(f"{BASE_URL}/api/products")
    assert gr.status_code == 200
    names = {p["name"] for p in gr.json()}
    assert {"TEST_BULK_Alpha", "TEST_BULK_Beta", "TEST_BULK_Gamma"}.issubset(names)

    # Cleanup
    for pid in data["ids"]:
        auth_session.delete(f"{BASE_URL}/api/products/{pid}")

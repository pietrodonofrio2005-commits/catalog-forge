"""Backend tests for vat_rate field in ProductIn / products endpoints."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'http://localhost:3000').rstrip('/')
# Backend URL comes from frontend/.env REACT_APP_BACKEND_URL
# But tests should use the same public URL
try:
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')
except Exception:
    pass


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@catalog.com", "password": "admin123"})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def created_ids(client):
    ids = []
    yield ids
    for pid in ids:
        try:
            client.delete(f"{BASE_URL}/api/products/{pid}")
        except Exception:
            pass


def test_create_product_with_vat_rate(client, created_ids):
    payload = {
        "name": "TEST_VAT_Product",
        "price": 100.0,
        "price_label": "plus",
        "vat_rate": 22.0,
    }
    r = client.post(f"{BASE_URL}/api/products", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["vat_rate"] == 22.0
    assert data["price_label"] == "plus"
    assert "id" in data
    created_ids.append(data["id"])

    # GET verify persistence
    g = client.get(f"{BASE_URL}/api/products/{data['id']}")
    assert g.status_code == 200
    assert g.json()["vat_rate"] == 22.0


def test_create_product_null_vat_rate(client, created_ids):
    payload = {"name": "TEST_VAT_None", "price": 50.0, "price_label": "plus"}
    r = client.post(f"{BASE_URL}/api/products", json=payload)
    assert r.status_code == 200
    data = r.json()
    assert data.get("vat_rate") is None
    created_ids.append(data["id"])


def test_update_product_vat_rate(client, created_ids):
    # Create
    r = client.post(f"{BASE_URL}/api/products", json={"name": "TEST_VAT_Update", "price": 10, "price_label": "plus", "vat_rate": 10})
    assert r.status_code == 200
    pid = r.json()["id"]
    created_ids.append(pid)

    # Update vat_rate
    upd = {"name": "TEST_VAT_Update", "price": 10, "price_label": "plus", "vat_rate": 4.0}
    u = client.put(f"{BASE_URL}/api/products/{pid}", json=upd)
    assert u.status_code == 200, u.text
    assert u.json()["vat_rate"] == 4.0

    # GET verify
    g = client.get(f"{BASE_URL}/api/products/{pid}")
    assert g.json()["vat_rate"] == 4.0

    # Set to null via update
    upd2 = {"name": "TEST_VAT_Update", "price": 10, "price_label": "", "vat_rate": None}
    u2 = client.put(f"{BASE_URL}/api/products/{pid}", json=upd2)
    assert u2.status_code == 200
    assert u2.json().get("vat_rate") is None


def test_list_products_returns_vat_rate(client, created_ids):
    r = client.get(f"{BASE_URL}/api/products")
    assert r.status_code == 200
    prods = r.json()
    # Ensure any of ours have the field present
    ours = [p for p in prods if p["id"] in created_ids]
    assert len(ours) >= 1
    for p in ours:
        assert "vat_rate" in p

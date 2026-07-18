"""Backend tests for per-product price_label (IVA) field round-trip."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://catalog-forge-7.preview.emergentagent.com').rstrip('/')
ADMIN_EMAIL = "admin@catalog.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def created_ids():
    ids = []
    yield ids
    # cleanup - separate session to avoid fixture ordering
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code == 200:
        data = r.json()
        token = data.get("token") or data.get("access_token")
        if token:
            s.headers.update({"Authorization": f"Bearer {token}"})
        for pid in ids:
            try:
                s.delete(f"{BASE_URL}/api/products/{pid}")
            except Exception:
                pass


@pytest.mark.parametrize("label", ["", "included", "plus"])
def test_create_with_price_label(session, created_ids, label):
    payload = {
        "name": f"TEST_pl_{label or 'empty'}",
        "description": "test",
        "price": 100.0,
        "price_label": label,
    }
    r = session.post(f"{BASE_URL}/api/products", json=payload)
    assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text}"
    data = r.json()
    assert data.get("price_label", "") == label
    pid = data.get("id") or data.get("_id")
    assert pid
    created_ids.append(pid)

    # GET verifies persistence
    g = session.get(f"{BASE_URL}/api/products")
    assert g.status_code == 200
    products = g.json()
    found = next((p for p in products if (p.get("id") or p.get("_id")) == pid), None)
    assert found is not None
    assert found.get("price_label", "") == label


def test_update_price_label_roundtrip(session, created_ids):
    # Create with "included"
    r = session.post(f"{BASE_URL}/api/products", json={
        "name": "TEST_pl_update", "price": 50.0, "price_label": "included"
    })
    assert r.status_code in (200, 201)
    pid = r.json().get("id") or r.json().get("_id")
    created_ids.append(pid)

    # Update to "plus"
    u = session.put(f"{BASE_URL}/api/products/{pid}", json={
        "name": "TEST_pl_update", "price": 50.0, "price_label": "plus"
    })
    assert u.status_code == 200, f"update failed: {u.text}"
    assert u.json().get("price_label") == "plus"

    # Verify via GET
    g = session.get(f"{BASE_URL}/api/products")
    products = g.json()
    found = next((p for p in products if (p.get("id") or p.get("_id")) == pid), None)
    assert found and found.get("price_label") == "plus"

    # Update to ""
    u2 = session.put(f"{BASE_URL}/api/products/{pid}", json={
        "name": "TEST_pl_update", "price": 50.0, "price_label": ""
    })
    assert u2.status_code == 200
    assert u2.json().get("price_label", "") == ""


def test_create_without_price_label_defaults_ok(session, created_ids):
    r = session.post(f"{BASE_URL}/api/products", json={
        "name": "TEST_pl_missing", "price": 10.0
    })
    assert r.status_code in (200, 201), f"got {r.status_code}: {r.text}"
    data = r.json()
    pid = data.get("id") or data.get("_id")
    created_ids.append(pid)
    # Default should be "" or missing
    assert data.get("price_label", "") == ""

    # GET all products still succeeds even for legacy products without field
    g = session.get(f"{BASE_URL}/api/products")
    assert g.status_code == 200
    assert isinstance(g.json(), list)

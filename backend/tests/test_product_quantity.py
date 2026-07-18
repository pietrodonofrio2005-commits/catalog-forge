"""Tests for new fields sku/quantity round-trip on products (iteration 6)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "admin@catalog.com", "password": "admin123"})
    assert r.status_code == 200, r.text
    return s


def _cleanup(client, pid):
    try:
        client.delete(f"{API}/products/{pid}")
    except Exception:
        pass


def test_create_product_with_quantity(client):
    payload = {"name": "TEST_QTY_1", "sku": "SKU-QTY-001", "quantity": 42}
    r = client.post(f"{API}/products", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["sku"] == "SKU-QTY-001"
    assert data["quantity"] == 42
    pid = data["id"]

    # GET verifies persistence
    r2 = client.get(f"{API}/products/{pid}")
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["quantity"] == 42
    assert d2["sku"] == "SKU-QTY-001"
    _cleanup(client, pid)


def test_create_product_null_quantity(client):
    r = client.post(f"{API}/products", json={"name": "TEST_QTY_NULL"})
    assert r.status_code == 200
    data = r.json()
    assert data.get("quantity") is None
    _cleanup(client, data["id"])


def test_update_quantity(client):
    r = client.post(f"{API}/products", json={"name": "TEST_QTY_UPD", "quantity": 5})
    pid = r.json()["id"]
    r2 = client.put(f"{API}/products/{pid}", json={"name": "TEST_QTY_UPD", "sku": "S1", "quantity": 99})
    assert r2.status_code == 200
    assert r2.json()["quantity"] == 99
    assert r2.json()["sku"] == "S1"
    r3 = client.get(f"{API}/products/{pid}")
    assert r3.json()["quantity"] == 99
    _cleanup(client, pid)


def test_list_products_returns_quantity_field(client):
    r = client.post(f"{API}/products", json={"name": "TEST_QTY_LIST", "quantity": 7})
    pid = r.json()["id"]
    r2 = client.get(f"{API}/products")
    assert r2.status_code == 200
    match = next((p for p in r2.json() if p["id"] == pid), None)
    assert match is not None
    assert match["quantity"] == 7
    _cleanup(client, pid)


def test_bulk_import_quantity_aliases(client):
    # Simulate what frontend sends after Excel mapping
    payload = [
        {"name": "TEST_BULK_Q1", "quantity": 10},
        {"name": "TEST_BULK_Q2", "quantity": 0},
        {"name": "TEST_BULK_Q3", "quantity": None},
    ]
    r = client.post(f"{API}/products/bulk", json=payload)
    assert r.status_code == 200
    ids = r.json()["ids"]
    assert len(ids) == 3
    # Fetch and check
    listing = client.get(f"{API}/products").json()
    by_id = {p["id"]: p for p in listing}
    assert by_id[ids[0]]["quantity"] == 10
    assert by_id[ids[1]]["quantity"] == 0
    assert by_id[ids[2]]["quantity"] is None
    for pid in ids:
        _cleanup(client, pid)


def test_catalog_settings_new_fields_roundtrip(client):
    # Save catalog with new settings and reload
    settings = {
        "pageOrder": ["cover", "index", "about", "contact", "products"],
        "aboutEnabled": True,
        "contactEnabled": True,
        "showIndex": True,
        "aboutTitle": "Chi Siamo",
        "aboutDescription": "About us test",
        "aboutImages": ["p/a.jpg"],
        "contactTitle": "Contatti",
        "contactEmail": "x@y.z",
        "contactPhone": "123",
        "contactAddress": "Rome",
        "showSku": True,
        "showQuantity": True,
    }
    r = client.post(f"{API}/catalogs", json={"name": "TEST_CAT_PAGES", "settings": settings, "product_ids": []})
    assert r.status_code == 200
    cid = r.json()["id"]
    r2 = client.get(f"{API}/catalogs/{cid}")
    assert r2.status_code == 200
    s2 = r2.json()["settings"]
    assert s2["pageOrder"] == settings["pageOrder"]
    assert s2["aboutEnabled"] is True
    assert s2["contactEnabled"] is True
    assert s2["aboutDescription"] == "About us test"
    assert s2["showSku"] is True
    assert s2["showQuantity"] is True
    client.delete(f"{API}/catalogs/{cid}")

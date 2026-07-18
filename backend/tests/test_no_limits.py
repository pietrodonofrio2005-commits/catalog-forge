"""Tests for iteration 5: unlimited product/catalog listing + image edit persistence."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'http://localhost:8001').rstrip('/')
# Use frontend/.env value:
try:
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')
                break
except Exception:
    pass

ADMIN_EMAIL = "admin@catalog.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return s


def test_bulk_insert_and_list_no_limit(client):
    # Insert 5 test products
    payload = [{"name": f"TEST_NoLimit_{i}", "category": "TEST_CAT", "price": float(i)} for i in range(5)]
    r = client.post(f"{BASE_URL}/api/products/bulk", json=payload)
    assert r.status_code == 200, r.text
    inserted_ids = r.json()["ids"]
    assert len(inserted_ids) == 5

    # List and confirm all 5 are present
    r = client.get(f"{BASE_URL}/api/products")
    assert r.status_code == 200
    products = r.json()
    returned_ids = {p["id"] for p in products}
    for pid in inserted_ids:
        assert pid in returned_ids
    # Also assert list length not truncated to arbitrary limit
    assert len(products) >= 5

    # Cleanup
    for pid in inserted_ids:
        client.delete(f"{BASE_URL}/api/products/{pid}")


def test_list_catalogs_no_limit(client):
    r = client.get(f"{BASE_URL}/api/catalogs")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_edit_image_path_persistence(client):
    # Create image-less product (simulates Excel import)
    r = client.post(f"{BASE_URL}/api/products", json={"name": "TEST_EditImg", "price": 1.0})
    assert r.status_code == 200
    pid = r.json()["id"]
    assert r.json().get("image_path") in (None, "")

    # Upload a tiny PNG
    import base64
    png_bytes = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    )
    files = {"file": ("t.png", png_bytes, "image/png")}
    r = client.post(f"{BASE_URL}/api/upload", files=files)
    assert r.status_code == 200, r.text
    upload_path = r.json()["path"]

    # PUT with image_path
    r = client.put(f"{BASE_URL}/api/products/{pid}", json={"name": "TEST_EditImg", "price": 1.0, "image_path": upload_path})
    assert r.status_code == 200
    assert r.json()["image_path"] == upload_path

    # GET verify persistence
    r = client.get(f"{BASE_URL}/api/products/{pid}")
    assert r.status_code == 200
    assert r.json()["image_path"] == upload_path

    # PUT with image_path=null (remove)
    r = client.put(f"{BASE_URL}/api/products/{pid}", json={"name": "TEST_EditImg", "price": 1.0, "image_path": None})
    assert r.status_code == 200
    assert r.json()["image_path"] is None

    # GET verify persistence
    r = client.get(f"{BASE_URL}/api/products/{pid}")
    assert r.json()["image_path"] is None

    # Cleanup
    client.delete(f"{BASE_URL}/api/products/{pid}")


def test_regression_auth_me(client):
    r = client.get(f"{BASE_URL}/api/auth/me")
    assert r.status_code == 200
    assert r.json()["email"] == ADMIN_EMAIL

"""Tests for new catalog features: update, duplicate, share, unshare, public fetch, file share access."""
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


@pytest.fixture(scope="module")
def product_ids(auth_session):
    r = auth_session.get(f"{BASE_URL}/api/products")
    assert r.status_code == 200
    prods = r.json()
    assert len(prods) >= 1, "Need at least 1 product seeded"
    return [p["id"] for p in prods]


@pytest.fixture(scope="module")
def catalog_id(auth_session, product_ids):
    payload = {
        "name": "TEST_share_catalog",
        "settings": {"showPrices": True, "coverTitle": "Test"},
        "product_ids": product_ids[:2],
    }
    r = auth_session.post(f"{BASE_URL}/api/catalogs", json=payload)
    assert r.status_code == 200, r.text
    cid = r.json()["id"]
    yield cid
    # cleanup
    try:
        auth_session.delete(f"{BASE_URL}/api/catalogs/{cid}")
    except Exception:
        pass


class TestCatalogUpdate:
    def test_put_updates_catalog(self, auth_session, catalog_id, product_ids):
        payload = {
            "name": "TEST_share_catalog_updated",
            "settings": {"showPrices": False, "coverTitle": "Updated"},
            "product_ids": product_ids[:1],
        }
        r = auth_session.put(f"{BASE_URL}/api/catalogs/{catalog_id}", json=payload)
        assert r.status_code == 200, r.text
        # verify via GET
        g = auth_session.get(f"{BASE_URL}/api/catalogs/{catalog_id}")
        assert g.status_code == 200
        data = g.json()
        assert data["name"] == "TEST_share_catalog_updated"
        assert data["settings"]["showPrices"] is False
        assert data["product_ids"] == product_ids[:1]

    def test_put_requires_auth(self, catalog_id):
        r = requests.put(f"{BASE_URL}/api/catalogs/{catalog_id}", json={"name": "x"})
        assert r.status_code in (401, 403)


class TestCatalogDuplicate:
    def test_duplicate_creates_copy(self, auth_session, catalog_id):
        r = auth_session.post(f"{BASE_URL}/api/catalogs/{catalog_id}/duplicate")
        assert r.status_code == 200, r.text
        new_cat = r.json()
        assert "id" in new_cat
        assert new_cat["id"] != catalog_id
        assert "(copia)" in new_cat["name"]
        # cleanup
        auth_session.delete(f"{BASE_URL}/api/catalogs/{new_cat['id']}")


class TestCatalogShare:
    def test_share_idempotent(self, auth_session, catalog_id):
        r1 = auth_session.post(f"{BASE_URL}/api/catalogs/{catalog_id}/share")
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1["is_public"] is True
        token1 = d1["share_token"]
        assert token1

        r2 = auth_session.post(f"{BASE_URL}/api/catalogs/{catalog_id}/share")
        assert r2.status_code == 200
        assert r2.json()["share_token"] == token1, "Share should be idempotent"

    def test_public_fetch_without_auth(self, auth_session, catalog_id):
        share = auth_session.post(f"{BASE_URL}/api/catalogs/{catalog_id}/share").json()
        token = share["share_token"]
        # fresh session, no cookies
        r = requests.get(f"{BASE_URL}/api/public/catalogs/{token}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "catalog" in data
        assert "products" in data
        assert isinstance(data["products"], list)

    def test_public_fetch_wrong_token(self):
        r = requests.get(f"{BASE_URL}/api/public/catalogs/wrongtokendoesnotexist")
        assert r.status_code == 404

    def test_file_access_via_share(self, auth_session, catalog_id):
        share = auth_session.post(f"{BASE_URL}/api/catalogs/{catalog_id}/share").json()
        token = share["share_token"]
        pub = requests.get(f"{BASE_URL}/api/public/catalogs/{token}").json()
        # find first product with image_path
        img_path = None
        for p in pub["products"]:
            if p.get("image_path"):
                img_path = p["image_path"]
                break
        if not img_path:
            pytest.skip("No product image path available to test")
        r = requests.get(f"{BASE_URL}/api/files/{img_path}?share={token}")
        assert r.status_code == 200, f"Expected 200, got {r.status_code} {r.text[:200]}"
        assert len(r.content) > 0

    def test_file_access_invalid_share_token(self, auth_session, catalog_id):
        pub_token = auth_session.post(f"{BASE_URL}/api/catalogs/{catalog_id}/share").json()["share_token"]
        pub = requests.get(f"{BASE_URL}/api/public/catalogs/{pub_token}").json()
        img_path = None
        for p in pub["products"]:
            if p.get("image_path"):
                img_path = p["image_path"]
                break
        if not img_path:
            pytest.skip("no image")
        r = requests.get(f"{BASE_URL}/api/files/{img_path}?share=invalid_bogus_token")
        assert r.status_code == 401

    def test_unshare(self, auth_session, catalog_id):
        token = auth_session.post(f"{BASE_URL}/api/catalogs/{catalog_id}/share").json()["share_token"]
        r = auth_session.delete(f"{BASE_URL}/api/catalogs/{catalog_id}/share")
        assert r.status_code == 200
        assert r.json()["is_public"] is False
        r2 = requests.get(f"{BASE_URL}/api/public/catalogs/{token}")
        assert r2.status_code == 404

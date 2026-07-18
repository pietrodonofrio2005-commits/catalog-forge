from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import logging
import secrets
import requests
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Annotated

import bcrypt
import jwt
from bson import ObjectId
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File, Header, Query
from fastapi.responses import Response as FastResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, BeforeValidator, ConfigDict

# ---------- MongoDB ----------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# ---------- Object storage ----------
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = os.environ.get("APP_NAME", "catalog-forge")
storage_key = None


def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path: str, data: bytes, content_type: str):
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60,
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ---------- Auth utilities ----------
JWT_ALGORITHM = "HS256"


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "exp": datetime.now(timezone.utc) + timedelta(minutes=60 * 24), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "true").lower() == "true"
COOKIE_SAMESITE = os.environ.get("COOKIE_SAMESITE", "none")


def set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    response.set_cookie("access_token", access_token, httponly=True, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE, max_age=86400, path="/")
    response.set_cookie("refresh_token", refresh_token, httponly=True, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE, max_age=604800, path="/")


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["id"] = str(user["_id"])
        user.pop("_id", None)
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ---------- Models ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ProductIn(BaseModel):
    name: str
    description: str = ""
    product_type: str = ""
    category: str = ""
    subcategory: str = ""
    colors: List[str] = []
    sizes: List[str] = []
    price: float = 0.0
    discount: float = 0.0
    image_path: Optional[str] = None
    sku: Optional[str] = None
    quantity: Optional[int] = None
    price_label: Optional[str] = ""  # "" | "included" | "plus"
    vat_rate: Optional[float] = None  # only meaningful when price_label == "plus"


class CatalogIn(BaseModel):
    name: str
    settings: dict = {}
    product_ids: List[str] = []


# ---------- App ----------
app = FastAPI()
api_router = APIRouter(prefix="/api")
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup():
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.products.create_index([("user_id", 1), ("category", 1), ("subcategory", 1)])
    await db.catalogs.create_index([("user_id", 1), ("created_at", -1)])

    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@catalog.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Admin",
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Admin seeded: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})

    # Storage init
    try:
        init_storage()
        logger.info("Object storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")


# ---------- Auth routes ----------
@api_router.post("/auth/register")
async def register(payload: RegisterIn, response: Response):
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": payload.name,
        "role": "user",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.users.insert_one(doc)
    uid = str(result.inserted_id)
    access = create_access_token(uid, email)
    refresh = create_refresh_token(uid)
    set_auth_cookies(response, access, refresh)
    return {"id": uid, "email": email, "name": payload.name, "role": "user"}


@api_router.post("/auth/login")
async def login(payload: LoginIn, response: Response):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    uid = str(user["_id"])
    access = create_access_token(uid, email)
    refresh = create_refresh_token(uid)
    set_auth_cookies(response, access, refresh)
    return {"id": uid, "email": email, "name": user.get("name", ""), "role": user.get("role", "user")}


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


# ---------- Upload ----------
@api_router.post("/upload")
async def upload_file(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "bin"
    path = f"{APP_NAME}/uploads/{user['id']}/{uuid.uuid4()}.{ext}"
    data = await file.read()
    result = put_object(path, data, file.content_type or "application/octet-stream")
    await db.files.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": file.content_type,
        "size": result.get("size", len(data)),
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"path": result["path"], "size": result.get("size", len(data))}


@api_router.get("/files/{path:path}")
async def download_file(path: str, request: Request, auth: Optional[str] = Query(None), share: Optional[str] = Query(None)):
    # Public access via share token: file must belong to a product referenced by a shared catalog
    if share:
        catalog = await db.catalogs.find_one({"share_token": share, "is_public": True})
        if not catalog:
            raise HTTPException(status_code=401, detail="Invalid share token")
        product_ids = catalog.get("product_ids", [])
        obj_ids = []
        for pid in product_ids:
            try:
                obj_ids.append(ObjectId(pid))
            except Exception:
                pass
        allowed = False
        if obj_ids:
            match = await db.products.find_one({"_id": {"$in": obj_ids}, "image_path": path})
            allowed = match is not None
        # Also allow cover/logo of the shared catalog
        if not allowed:
            settings = catalog.get("settings", {}) or {}
            if settings.get("coverImagePath") == path or settings.get("logoPath") == path:
                allowed = True
        if not allowed:
            raise HTTPException(status_code=403, detail="File not in shared catalog")
        record = await db.files.find_one({"storage_path": path, "is_deleted": False})
        data, content_type = get_object(path)
        return FastResponse(content=data, media_type=(record or {}).get("content_type") or content_type)

    # Authenticated access
    token = request.cookies.get("access_token") or auth
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    record = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    data, content_type = get_object(path)
    return FastResponse(content=data, media_type=record.get("content_type") or content_type)


# ---------- Products ----------
def _product_from_doc(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    return doc


@api_router.post("/products")
async def create_product(payload: ProductIn, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc["user_id"] = user["id"]
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["updated_at"] = doc["created_at"]
    result = await db.products.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _product_from_doc(doc)


@api_router.post("/products/bulk")
async def bulk_create_products(payload: List[ProductIn], user: dict = Depends(get_current_user)):
    if not payload:
        raise HTTPException(status_code=400, detail="Nessun prodotto da importare")
    now = datetime.now(timezone.utc).isoformat()
    docs = []
    for p in payload:
        d = p.model_dump()
        d["user_id"] = user["id"]
        d["created_at"] = now
        d["updated_at"] = now
        docs.append(d)
    result = await db.products.insert_many(docs)
    return {"inserted": len(result.inserted_ids), "ids": [str(x) for x in result.inserted_ids]}


@api_router.get("/products")
async def list_products(
    user: dict = Depends(get_current_user),
    category: Optional[str] = None,
    subcategory: Optional[str] = None,
    q: Optional[str] = None,
):
    query = {"user_id": user["id"]}
    if category:
        query["category"] = category
    if subcategory:
        query["subcategory"] = subcategory
    if q:
        query["name"] = {"$regex": q, "$options": "i"}
    docs = await db.products.find(query).sort("created_at", -1).to_list(length=None)
    return [_product_from_doc(d) for d in docs]


@api_router.get("/products/categories")
async def get_categories(user: dict = Depends(get_current_user)):
    pipeline = [
        {"$match": {"user_id": user["id"]}},
        {"$group": {"_id": {"category": "$category", "subcategory": "$subcategory"}}},
    ]
    result = {}
    async for row in db.products.aggregate(pipeline):
        cat = row["_id"].get("category") or "Senza categoria"
        sub = row["_id"].get("subcategory") or ""
        result.setdefault(cat, set())
        if sub:
            result[cat].add(sub)
    return {k: sorted(list(v)) for k, v in result.items()}


@api_router.get("/products/{product_id}")
async def get_product(product_id: str, user: dict = Depends(get_current_user)):
    doc = await db.products.find_one({"_id": ObjectId(product_id), "user_id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Product not found")
    return _product_from_doc(doc)


@api_router.put("/products/{product_id}")
async def update_product(product_id: str, payload: ProductIn, user: dict = Depends(get_current_user)):
    update = payload.model_dump()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.products.update_one(
        {"_id": ObjectId(product_id), "user_id": user["id"]},
        {"$set": update},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    doc = await db.products.find_one({"_id": ObjectId(product_id)})
    return _product_from_doc(doc)


@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, user: dict = Depends(get_current_user)):
    result = await db.products.delete_one({"_id": ObjectId(product_id), "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"ok": True}


# ---------- Catalogs ----------
def _catalog_from_doc(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    return doc


@api_router.post("/catalogs")
async def create_catalog(payload: CatalogIn, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc["user_id"] = user["id"]
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["updated_at"] = doc["created_at"]
    doc["is_public"] = False
    doc["share_token"] = None
    result = await db.catalogs.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _catalog_from_doc(doc)


@api_router.get("/catalogs")
async def list_catalogs(user: dict = Depends(get_current_user)):
    docs = await db.catalogs.find({"user_id": user["id"]}).sort("created_at", -1).to_list(length=None)
    return [_catalog_from_doc(d) for d in docs]


@api_router.get("/catalogs/{catalog_id}")
async def get_catalog(catalog_id: str, user: dict = Depends(get_current_user)):
    doc = await db.catalogs.find_one({"_id": ObjectId(catalog_id), "user_id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Catalog not found")
    return _catalog_from_doc(doc)


@api_router.put("/catalogs/{catalog_id}")
async def update_catalog(catalog_id: str, payload: CatalogIn, user: dict = Depends(get_current_user)):
    update = payload.model_dump()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.catalogs.update_one(
        {"_id": ObjectId(catalog_id), "user_id": user["id"]},
        {"$set": update},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Catalog not found")
    doc = await db.catalogs.find_one({"_id": ObjectId(catalog_id)})
    return _catalog_from_doc(doc)


@api_router.post("/catalogs/{catalog_id}/duplicate")
async def duplicate_catalog(catalog_id: str, user: dict = Depends(get_current_user)):
    src = await db.catalogs.find_one({"_id": ObjectId(catalog_id), "user_id": user["id"]})
    if not src:
        raise HTTPException(status_code=404, detail="Catalog not found")
    now = datetime.now(timezone.utc).isoformat()
    new_doc = {
        "user_id": user["id"],
        "name": f"{src.get('name', 'Catalogo')} (copia)",
        "settings": src.get("settings", {}),
        "product_ids": src.get("product_ids", []),
        "created_at": now,
        "updated_at": now,
        "is_public": False,
        "share_token": None,
    }
    result = await db.catalogs.insert_one(new_doc)
    new_doc["_id"] = result.inserted_id
    return _catalog_from_doc(new_doc)


@api_router.post("/catalogs/{catalog_id}/share")
async def share_catalog(catalog_id: str, user: dict = Depends(get_current_user)):
    doc = await db.catalogs.find_one({"_id": ObjectId(catalog_id), "user_id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Catalog not found")
    token = doc.get("share_token") or secrets.token_urlsafe(16)
    await db.catalogs.update_one(
        {"_id": ObjectId(catalog_id)},
        {"$set": {"is_public": True, "share_token": token}},
    )
    return {"is_public": True, "share_token": token}


@api_router.delete("/catalogs/{catalog_id}/share")
async def unshare_catalog(catalog_id: str, user: dict = Depends(get_current_user)):
    result = await db.catalogs.update_one(
        {"_id": ObjectId(catalog_id), "user_id": user["id"]},
        {"$set": {"is_public": False}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Catalog not found")
    return {"is_public": False}


@api_router.get("/public/catalogs/{token}")
async def get_public_catalog(token: str):
    doc = await db.catalogs.find_one({"share_token": token, "is_public": True})
    if not doc:
        raise HTTPException(status_code=404, detail="Catalog not available")
    catalog = _catalog_from_doc(doc)
    # Load referenced products
    product_ids = catalog.get("product_ids", [])
    obj_ids = []
    for pid in product_ids:
        try:
            obj_ids.append(ObjectId(pid))
        except Exception:
            pass
    products = []
    if obj_ids:
        pdocs = await db.products.find({"_id": {"$in": obj_ids}}).to_list(length=None)
        # Preserve order
        by_id = {str(p["_id"]): p for p in pdocs}
        for pid in product_ids:
            p = by_id.get(pid)
            if p:
                products.append(_product_from_doc(p))
    # Remove user_id from catalog payload
    catalog.pop("user_id", None)
    return {"catalog": catalog, "products": products}


@api_router.delete("/catalogs/{catalog_id}")
async def delete_catalog(catalog_id: str, user: dict = Depends(get_current_user)):
    result = await db.catalogs.delete_one({"_id": ObjectId(catalog_id), "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Catalog not found")
    return {"ok": True}


@api_router.get("/")
async def root():
    return {"message": "Catalog Forge API"}


# Register router
app.include_router(api_router)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[os.environ.get("FRONTEND_URL", "*"), "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

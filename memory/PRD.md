# Catalog Forge - PRD

## Problem Statement (Original, Italian)
Sito che permette di caricare prodotti e genera cataloghi personalizzabili automaticamente. Sezioni: caricamento prodotti (descrizione, tipo, categoria/sottocategoria, colori, taglie, prezzo, sconti), modifica prodotti (con barra laterale filtri categoria/sottocategoria + eliminazione), creazione catalogo (ordinamento per categoria, righe/colonne, impaginazione, sfondo, layout, colori), cronologia cataloghi. Download in vari formati, soprattutto PDF.

## Architecture
- **Backend**: FastAPI + MongoDB (Motor) + JWT auth (bcrypt + PyJWT, httpOnly cookies) + Emergent Object Storage for product images
- **Frontend**: React 19 + React Router 7 + Shadcn UI + Tailwind + Sonner (toast) + jsPDF + html2canvas (client-side PDF/PNG generation)
- **Design**: Swiss & High-Contrast (Cobalt Blue #0047AB), Cabinet Grotesk (headings) + IBM Plex Sans (body)

## User Personas
- Piccoli commercianti / negozi che vogliono creare cataloghi PDF professionali
- Rivenditori che generano listini stagionali
- Brand fashion/accessori con collezioni ricorrenti

## Core Requirements (static)
1. Autenticazione utente (JWT)
2. Upload/Modifica/Eliminazione prodotti (con immagine, categoria, sottocategoria, colori, taglie, prezzo, sconto)
3. Filtro laterale per categoria/sottocategoria + ricerca
4. Costruttore catalogo con anteprima live (colonne/righe, layout, sfondo, colori, font, copertina, header/footer)
5. Export PDF/PNG/HTML client-side
6. Cronologia cataloghi salvati

## Implemented (2026-02-16)
- ✅ JWT auth (register/login/me/logout + admin seed + brute-force safe)
- ✅ Product CRUD API + categories aggregation
- ✅ Object storage upload + protected file download
- ✅ Catalog CRUD API (settings JSON + product_ids)
- ✅ Login/Register pages (2-panel design)
- ✅ Dashboard shell with collapsible sidebar
- ✅ Product upload page (image, description, category/subcategory, colors/sizes tags, price, discount)
- ✅ Product management page with sidebar filter + edit dialog + delete
- ✅ Catalog builder with 3-tab settings (Layout / Style / Content) + live preview + 4 layout presets
- ✅ Export PDF (multi-page A4), PNG (per page), HTML (self-contained)
- ✅ Catalog history page with thumbnails

## Backlog (P1)
- P1: Drag-and-drop product ordering inside catalog
- P1: Select subset of products for catalog (checkbox)
- P1: Multiple images per product
- P1: Custom cover image upload + logo upload

## Backlog (P2)
- P2: Share catalog via public link
- P2: Duplicate catalog from history
- P2: Excel/CSV import/export for products
- P2: Template gallery (pre-made themes)
- P2: Multi-language catalog output

## Test Credentials
See `/app/memory/test_credentials.md`
- Admin: admin@catalog.com / admin123

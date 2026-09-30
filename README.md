# FATScope

A read-only FAT32 forensic analysis workbench. Upload an authorised FAT32 volume image or MBR disk
image and inspect the filesystem through a browser interface. Every displayed value is produced by
the Python parser from the raw image bytes. The image is never mounted, never modified, and no
extracted content is ever executed.

```
project/
├── backend/     FastAPI service, FAT32 parser, SQLite persistence, report generation
├── frontend/    Next.js App Router workbench
├── docker-compose.yml
├── render.yaml
└── railway.json
```

## What it does

**Parsing.** A bounded parser reads the evidence image through a read-only `mmap` view. It detects
raw FAT32 volumes and MBR disks containing a FAT32 partition, decodes the BIOS Parameter Block and
extended BPB, compares the primary and backup boot sectors byte by byte, validates the FSInfo
sector, compares every FAT copy, decodes 28-bit FAT entries, and walks cluster chains with loop and
bounds protection.

**Directory traversal.** Nested directories are traversed breadth-first with depth, entry-count and
visited-cluster limits. Short 8.3 names, checksum-validated long filenames, hidden, system,
read-only, archive, volume-label, directory and deleted entries are all recovered, along with
creation, modification and access timestamps. Deleted entries that still have long filename records
have their lost first character restored by brute-forcing the 8-bit LFN checksum, which is a
bijection in the first byte and therefore yields exactly one candidate. Entries found after the
directory terminator are reported as residual.

**Allocation analysis.** Free, allocated, reserved, bad, orphaned, cross-linked and looped clusters
are classified, run-length encoded and stored for the cluster map. Broken chains, out-of-range
cluster pointers, size/chain mismatches and non-zero file slack are detected and reported as
findings with severity levels.

**Recovery.** Deleted entries are scored for recoverability from their recorded start cluster, the
number of clusters still marked free, single-cluster fit, long filename validation and residual
status. Recovery carves the contiguous run and stores a downloadable file with its own SHA-256.

**Reporting.** JSON, CSV and a formatted PDF report are generated from the persisted analysis.

## Prerequisites

- Python 3.12
- Node.js 20 or newer (developed on Node 24)

## Run locally

Two terminals.

Backend:

```
cd backend
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt -r requirements-dev.txt
copy .env.example .env
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

On macOS or Linux use `python3.12 -m venv .venv`, `.venv/bin/python`, and `cp .env.example .env`.

Frontend:

```
cd frontend
npm install
copy .env.example .env.local
npm run dev
```

Open http://localhost:3000. The API is served from http://127.0.0.1:8000 with interactive
documentation at http://127.0.0.1:8000/docs.

Select **Open demo case** on the first screen to generate and analyse the synthetic FAT32 evidence
image. It is a 33.5 MB MBR disk with one FAT32 partition containing normal, hidden, system,
fragmented, long-named and deleted files plus twelve planted forensic conditions, and it is parsed
by exactly the same engine as an uploaded image.

## Environment variables

Backend (`backend/.env`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated CORS origins |
| `MAX_UPLOAD_MB` | `512` | Hard limit for uploaded evidence images |
| `DATA_DIR` | `./data` | SQLite database, uploads, demo image, recovered files |
| `ANALYSIS_TTL_HOURS` | `24` | Retention window before analyses and artefacts are purged |

Frontend (`frontend/.env.local`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | `http://127.0.0.1:8000` | Origin of the analysis API |

## Validation

Backend:

```
cd backend
.venv\Scripts\python.exe -m ruff check .
.venv\Scripts\python.exe -m pytest
.venv\Scripts\python.exe -m compileall -q app tests
```

Frontend:

```
cd frontend
npm run lint
npm run typecheck
npm run test
npm run build
```

`npm run validate` runs all four frontend checks in sequence.

## API

All endpoints are served under `/api/v1`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness, version and database check |
| GET | `/meta` | Service limits, supported containers, demo image description |
| POST | `/analyses` | Create an analysis from a multipart upload |
| POST | `/analyses/demo` | Create an analysis from the generated demo image |
| GET | `/analyses` | List analyses with paging and status filter |
| GET | `/analyses/{id}` | Analysis record with progress and severity totals |
| GET | `/analyses/{id}/status` | Lightweight polling endpoint |
| DELETE | `/analyses/{id}` | Delete an analysis and its stored artefacts |
| GET | `/analyses/{id}/summary` | Evidence identity, geometry, FAT health, statistics |
| GET | `/analyses/{id}/geometry` | Volume geometry, boot sector and partition table |
| GET | `/analyses/{id}/entries` | Paginated, filterable, sortable filesystem entries |
| GET | `/analyses/{id}/entries/{entryId}` | Single entry |
| GET | `/analyses/{id}/entries/{entryId}/preview` | Bounded text or binary preview |
| GET | `/analyses/{id}/tree` | Lazy directory-tree children |
| GET | `/analyses/{id}/findings` | Findings with severity and category filters |
| GET | `/analyses/{id}/clusters` | Compressed cluster-map ranges and state totals |
| GET | `/analyses/{id}/clusters/{cluster}` | Cluster state, offset and owning entry |
| GET | `/analyses/{id}/timeline` | Timestamp buckets and paginated events |
| GET | `/analyses/{id}/hex` | Bounded byte-range read, base64 encoded |
| POST | `/analyses/{id}/recover` | Recover eligible deleted entries |
| GET | `/analyses/{id}/recoveries` | Recovered files for an analysis |
| GET | `/analyses/{id}/recoveries/{recoveryId}/download` | Download a recovered file |
| GET | `/analyses/{id}/reports/{json\|csv\|pdf}` | Download a report |

Uploads return an analysis identifier immediately. Parsing runs on a bounded thread pool and the
status, progress percentage and current stage are persisted in SQLite so the interface can poll.

## Deployment

### Frontend on Vercel

1. Import the repository and set the project root directory to `frontend`.
2. Vercel detects Next.js; `frontend/vercel.json` pins the build and install commands and adds the
   security headers.
3. Set `NEXT_PUBLIC_API_BASE_URL` to the public origin of the deployed backend, without a trailing
   slash, for the Production, Preview and Development environments.
4. Deploy, then add the resulting Vercel origin to the backend `ALLOWED_ORIGINS`.

### Backend on Render

1. Create a Blueprint from `render.yaml`, or create a Web Service manually with runtime Docker,
   root directory `backend` and Dockerfile path `./Dockerfile`.
2. Attach a persistent disk mounted at `/data`.
3. Set `ALLOWED_ORIGINS` to the Vercel origin, and confirm `DATA_DIR=/data`, `MAX_UPLOAD_MB` and
   `ANALYSIS_TTL_HOURS`.
4. Health checks use `/api/v1/health`.

### Backend on Railway

1. Create a service from the repository; `railway.json` selects `backend/Dockerfile` and the start
   command that binds `$PORT`.
2. Attach a volume mounted at `/data` and set `DATA_DIR=/data`.
3. Set `ALLOWED_ORIGINS` to the Vercel origin.

### Backend with Docker locally

```
docker compose up --build
```

The API listens on port 8000 and stores evidence in the `evidence` volume.

## Evidence handling

- Images are opened with `mmap.ACCESS_READ` and every read is bounds-checked.
- Uploaded filenames are sanitised to `[A-Za-z0-9._-]`, stripped of path components and truncated.
- Uploads are streamed to disk and aborted as soon as they exceed `MAX_UPLOAD_MB`.
- Images, recovered files and database rows are deleted once `ANALYSIS_TTL_HOURS` elapses; the
  shared demo image is preserved.
- Recovered files are written to `DATA_DIR/recovered/<analysis>` and are only served as
  `application/octet-stream` attachments.
- Nothing extracted from an image is ever executed.

## Limitations

- Only FAT32 is parsed. FAT12, FAT16, exFAT, NTFS, ext4 and APFS are rejected with an explanatory
  message, as are GPT disks and compressed containers such as E01 or AFF.
- Recovery assumes contiguous allocation because FAT32 clears chain links on deletion. Fragmented
  deleted files recover only their first contiguous run, and the recovered size is reported
  alongside the declared size so truncation is visible.
- Deleted entries without long filename records permanently lose the first character of their 8.3
  name; it is displayed as `?`.
- Per-file SHA-256 is computed for allocated files up to 64 MB.
- Analysis is bounded at 250,000 directory entries, depth 64 and 8,000,000 clusters; hitting a limit
  raises an `ANALYSIS_TRUNCATED` finding.
- The PDF report lists the first 400 entries for readability; JSON and CSV contain every entry.
- Jobs run in an in-process thread pool with two workers, so a service restart marks in-flight
  analyses as failed. Horizontal scaling requires an external queue and shared storage.
- SQLite and local disk are used for persistence, so the backend expects a single instance with a
  persistent volume.

# STL Converter Service

Python Cloud Run service for converting a selected generated image into a printable STL relief.

This service is intentionally isolated from Firebase Functions. The conversion step may need image processing libraries, geometry libraries, more CPU, and longer request windows than short orchestration functions should handle.

## Local Development

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8088
```

Health check:

```powershell
Invoke-RestMethod http://localhost:8088/healthz
```

## Current State

The API contract is in place, but STL generation is not implemented yet. The next step is to add deterministic heightmap and mesh generation, then layer AI-assisted depth/segmentation experiments around it.


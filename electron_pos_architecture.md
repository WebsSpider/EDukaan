# 🧠 Electron POS System — Architecture & Development Plan

## Overview

This document defines the full architecture for a production-ready Electron + Vue + SQLite POS system with:

- Offline-first operation
- Trial system
- License activation & renewal
- Machine binding
- Signed license security
- Cloud backup (Google Drive)
- Feature-based monetization
- Minimal backend dependency

---

# 🧩 1. High-Level System Architecture

```
┌──────────────────────────────────────┐
│          Electron Application        │
│                                      │
│  ┌──────────────┐  ┌──────────────┐ │
│  │ Vue Renderer │  │ Main Process │ │
│  │ (UI Layer)   │  │ (Core Logic) │ │
│  └──────┬───────┘  └──────┬───────┘ │
│         │                  │         │
│         ▼                  ▼         │
│     POS UI           License Manager │
│     Reports          Backup Service  │
│     Settings         Security Layer  │
└────────┬──────────────────────┬──────┘
         │                      │
         ▼                      ▼
   SQLite Local DB     Signed License File
         │
         ▼
   Cloud Backend (Optional but recommended)
   - Supabase / Firebase / Cloudflare Workers
   - License API
   - Backup metadata API
```

---

# 🧱 2. Core Design Principles

## 1. Offline-first
- POS must fully work without internet
- Internet only needed for activation & backup

## 2. Separation of concerns
- License ≠ Backup ≠ Features

## 3. Trust signed data only
- No raw JSON trust
- All licenses must be cryptographically signed

## 4. Minimal backend dependency
- Backend only for:
  - Activation
  - Renewal
  - Backup metadata

---

# 🔐 3. Licensing System

## License Model (SIGNED)

```json
{
  "license_key": "ABC-123",
  "machine_id": "hashed-device-id",
  "expiry": "2026-12-31",
  "features": ["pos", "backup"],
  "max_devices": 1,
  "signature": "RSA_SIGNATURE"
}
```

---

## Lifecycle

### 🟢 Trial (First Run)
- Auto-generated machine_id
- Local trial timer (14 days)
- No license key required

### 🔵 Activation
Electron App → Backend → Validate License → Bind Machine → Return Signed License

### 🟡 Runtime Validation
- Verify RSA signature
- Validate expiry
- Check machine binding

### 🔁 Renewal
Backend issues NEW signed license (never modify old one)

---

# ☁️ 4. Backend System (Minimal)

Recommended options:
- Supabase
- Cloudflare Workers

---

## Database Schema

### licenses
- license_key
- expiry
- max_devices
- features
- status

### activations
- license_key
- machine_id
- activated_at

### backups
- license_key
- drive_folder_id
- last_backup_at

---

## APIs

### 1. POST /activateLicense
- binds machine
- returns signed license

### 2. POST /renewLicense
- extends expiry
- returns new signed license

### 3. POST /validateLicense
- optional periodic validation

---

# 💻 5. Electron Application Architecture

## Folder Structure

```
/src
  /main
    /license
    /backup
    /core
  /renderer
```

---

## Main Process Responsibilities

- License verification
- Machine fingerprint generation
- Backup handling
- API communication

---

# 🧪 6. Trial System

- 14-day trial
- Fully offline
- No backend required

---

# 🔑 7. Feature Flag System

License controls feature access:

```json
{
  "features": ["pos", "reports", "backup"]
}
```

---

# ☁️ 8. Cloud Backup System (Google Drive)

## Flow

SQLite DB → Export → Compress → Upload → Google Drive

---

# 🔐 9. Security Model

- RSA signed licenses
- ASAR packaging
- Code obfuscation
- Disable devtools

---

# 📦 10. Build Pipeline

1. Build Vue
2. Build Electron
3. Obfuscate
4. Package

---

# 🚀 Final Summary

Trial → Activation → Offline usage → Renewal → Backup → Feature upgrades

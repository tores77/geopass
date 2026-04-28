"""Concurrency stress test for Supabase client fix (iteration_1 CRITICAL bug).

Simulates Dashboard burst: /auth/me + /dashboard/stats + /dashboard/recent-socios +
/dashboard/recent-notifications all fired in parallel, many times in a row.
Expect: ZERO 500s.
"""
import os
import concurrent.futures as cf
import requests
import pytest
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path("/app/frontend/.env"))
load_dotenv(Path("/app/backend/.env"))

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
SB_URL = os.environ["REACT_APP_SUPABASE_URL"].rstrip("/")
SB_KEY = os.environ["REACT_APP_SUPABASE_ANON_KEY"]


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{SB_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": SB_KEY, "Content-Type": "application/json"},
        json={"email": "pere@umanialabs.com", "password": "123456Ab!!"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _call(url, token):
    return requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=120)


def test_dashboard_burst_no_500(token):
    """Simulate 5 dashboard loads back-to-back, each firing 4 parallel calls."""
    endpoints = [
        f"{BASE}/api/auth/me",
        f"{BASE}/api/dashboard/stats",
        f"{BASE}/api/dashboard/recent-socios",
        f"{BASE}/api/dashboard/recent-notifications",
    ]
    all_codes = []
    for burst in range(5):
        with cf.ThreadPoolExecutor(max_workers=4) as ex:
            futs = [ex.submit(_call, url, token) for url in endpoints]
            results = [f.result() for f in futs]
        codes = [r.status_code for r in results]
        all_codes.append((burst, codes))
        print(f"burst {burst}: {codes}")
    # zero 500s across all bursts
    flat = [c for _, codes in all_codes for c in codes]
    fivehundreds = [c for c in flat if c >= 500]
    assert not fivehundreds, f"500s detected: {all_codes}"
    # All 200s
    assert all(c == 200 for c in flat), f"non-200 codes: {all_codes}"


def test_high_concurrency_24_parallel(token):
    """24 mixed calls in parallel (replicates previous manual test)."""
    urls = [
        f"{BASE}/api/auth/me",
        f"{BASE}/api/dashboard/stats",
        f"{BASE}/api/dashboard/recent-socios",
        f"{BASE}/api/dashboard/recent-notifications",
    ] * 6

    with cf.ThreadPoolExecutor(max_workers=24) as ex:
        futs = [ex.submit(_call, u, token) for u in urls]
        results = [f.result() for f in futs]
    codes = [r.status_code for r in results]
    print(f"24 parallel codes: {codes}")
    assert not [c for c in codes if c >= 500], f"500s detected: {codes}"
    assert all(c == 200 for c in codes)

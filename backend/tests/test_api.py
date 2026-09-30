from __future__ import annotations

import base64
import io

from tests.conftest import wait_for_completion


def _completed_demo(client) -> str:
    response = client.post("/api/v1/analyses/demo", json={"case_id": "CASE-TEST-01"})
    assert response.status_code == 201
    analysis_id = response.json()["id"]
    final = wait_for_completion(client, analysis_id)
    assert final["status"] == "completed", final
    return analysis_id


def test_health_and_meta(client):
    health = client.get("/api/v1/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert health.json()["database"] == "ok"

    meta = client.get("/api/v1/meta")
    assert meta.status_code == 200
    payload = meta.json()
    assert payload["read_only"] is True
    assert ".img" in payload["supported_extensions"]
    assert payload["limits"]["max_upload_mb"] == 128
    assert payload["demo_image"]["cluster_count"] > 0


def test_demo_analysis_lifecycle(client):
    analysis_id = _completed_demo(client)
    detail = client.get(f"/api/v1/analyses/{analysis_id}")
    assert detail.status_code == 200
    body = detail.json()
    assert body["is_demo"] is True
    assert body["case_id"] == "CASE-TEST-01"
    assert body["progress"] == 100
    assert body["entry_count"] > 20
    assert body["severity_counts"]["critical"] >= 1
    assert len(body["image_sha256"]) == 64

    listing = client.get("/api/v1/analyses", params={"limit": 5})
    assert listing.status_code == 200
    assert listing.json()["total"] >= 1


def test_summary_and_geometry(client):
    analysis_id = _completed_demo(client)
    summary = client.get(f"/api/v1/analyses/{analysis_id}/summary").json()
    assert summary["geometry"]["cluster_count"] > 0
    assert summary["fat"]["identical"] is False
    assert summary["stats"]["deleted_count"] >= 3
    assert summary["cluster_state_counts"]["crosslinked"] > 0

    geometry = client.get(f"/api/v1/analyses/{analysis_id}/geometry").json()
    assert geometry["container"] == "mbr_disk"
    assert geometry["partitions"][0]["type_code"] in (0x0B, 0x0C)
    assert geometry["boot_sector"]["filesystem_type"] == "FAT32"


def test_entries_pagination_filtering_and_sorting(client):
    analysis_id = _completed_demo(client)
    first = client.get(
        f"/api/v1/analyses/{analysis_id}/entries",
        params={"page": 1, "page_size": 5, "sort": "size", "order": "desc"},
    ).json()
    assert first["page_size"] == 5
    assert len(first["items"]) == 5
    sizes = [item["size_bytes"] for item in first["items"]]
    assert sizes == sorted(sizes, reverse=True)

    deleted = client.get(
        f"/api/v1/analyses/{analysis_id}/entries", params={"entry_status": "deleted"}
    ).json()
    assert deleted["total"] >= 3
    assert all(item["is_deleted"] for item in deleted["items"])

    searched = client.get(
        f"/api/v1/analyses/{analysis_id}/entries", params={"search": "readme"}
    ).json()
    assert searched["total"] == 1
    assert searched["items"][0]["name"] == "README.TXT"

    damaged = client.get(
        f"/api/v1/analyses/{analysis_id}/entries", params={"entry_status": "damaged"}
    ).json()
    assert {item["chain_status"] for item in damaged["items"]} == {"broken_free", "loop"}

    invalid = client.get(
        f"/api/v1/analyses/{analysis_id}/entries", params={"sort": "nonsense"}
    )
    assert invalid.status_code == 422


def test_entry_detail_and_tree(client):
    analysis_id = _completed_demo(client)
    root = client.get(f"/api/v1/analyses/{analysis_id}/tree").json()
    assert root["parent_path"] == "/"
    directories = [item for item in root["items"] if item["is_directory"]]
    assert directories and directories[0]["has_children"]

    child = client.get(
        f"/api/v1/analyses/{analysis_id}/tree",
        params={"parent_entry_id": directories[0]["entry_id"]},
    ).json()
    assert child["items"]

    entry_id = child["items"][0]["entry_id"]
    entry = client.get(f"/api/v1/analyses/{analysis_id}/entries/{entry_id}").json()
    assert entry["entry_id"] == entry_id
    assert isinstance(entry["cluster_runs"], list)

    missing = client.get(f"/api/v1/analyses/{analysis_id}/entries/999999")
    assert missing.status_code == 404


def test_findings_filtering(client):
    analysis_id = _completed_demo(client)
    every = client.get(f"/api/v1/analyses/{analysis_id}/findings").json()
    assert every["total"] >= 10
    assert every["severity_counts"]["critical"] >= 1
    assert "allocation" in every["category_counts"]

    critical = client.get(
        f"/api/v1/analyses/{analysis_id}/findings", params={"severity": "critical,high"}
    ).json()
    assert {item["severity"] for item in critical["items"]} <= {"critical", "high"}

    invalid = client.get(
        f"/api/v1/analyses/{analysis_id}/findings", params={"severity": "catastrophic"}
    )
    assert invalid.status_code == 422


def test_cluster_map_and_cluster_detail(client):
    analysis_id = _completed_demo(client)
    cluster_map = client.get(f"/api/v1/analyses/{analysis_id}/clusters").json()
    assert cluster_map["cluster_count"] > 0
    assert cluster_map["total_ranges"] > 0
    assert cluster_map["ranges"][0]["start"] == 2
    assert cluster_map["state_counts"]["free"] > 0

    crosslinked = client.get(
        f"/api/v1/analyses/{analysis_id}/clusters", params={"state": "crosslinked"}
    ).json()
    assert crosslinked["ranges"]
    target = crosslinked["ranges"][0]["start"]

    detail = client.get(f"/api/v1/analyses/{analysis_id}/clusters/{target}").json()
    assert detail["state"] == "crosslinked"
    assert detail["offset"] > 0
    assert detail["entry"] is not None

    out_of_range = client.get(f"/api/v1/analyses/{analysis_id}/clusters/99999999")
    assert out_of_range.status_code == 404


def test_timeline(client):
    analysis_id = _completed_demo(client)
    timeline = client.get(
        f"/api/v1/analyses/{analysis_id}/timeline", params={"granularity": "day"}
    ).json()
    assert timeline["buckets"]
    assert timeline["total_events"] > 0
    assert timeline["events"][0]["kind"] in ("created", "modified", "accessed")
    assert timeline["earliest"] <= timeline["latest"]

    filtered = client.get(
        f"/api/v1/analyses/{analysis_id}/timeline", params={"kinds": "created"}
    ).json()
    assert {event["kind"] for event in filtered["events"]} == {"created"}

    invalid = client.get(f"/api/v1/analyses/{analysis_id}/timeline", params={"kinds": "burned"})
    assert invalid.status_code == 422


def test_hex_reads_are_bounded(client):
    analysis_id = _completed_demo(client)
    response = client.get(
        f"/api/v1/analyses/{analysis_id}/hex", params={"offset": 1048576, "length": 512}
    ).json()
    data = base64.b64decode(response["bytes_base64"])
    assert len(data) == 512
    assert data[510:512] == b"\x55\xaa"
    assert data[82:90] == b"FAT32   "

    too_large = client.get(
        f"/api/v1/analyses/{analysis_id}/hex", params={"offset": 0, "length": 999999}
    )
    assert too_large.status_code == 422

    beyond = client.get(
        f"/api/v1/analyses/{analysis_id}/hex", params={"offset": 10**12, "length": 16}
    )
    assert beyond.status_code == 416


def test_file_preview_detects_text_and_binary(client):
    analysis_id = _completed_demo(client)
    entries = client.get(
        f"/api/v1/analyses/{analysis_id}/entries", params={"search": "README.TXT"}
    ).json()["items"]
    text_preview = client.get(
        f"/api/v1/analyses/{analysis_id}/entries/{entries[0]['entry_id']}/preview"
    ).json()
    assert text_preview["kind"] == "text"
    assert "FATScope demo evidence volume" in text_preview["text"]

    images = client.get(
        f"/api/v1/analyses/{analysis_id}/entries", params={"search": "DSC_0001"}
    ).json()["items"]
    binary_preview = client.get(
        f"/api/v1/analyses/{analysis_id}/entries/{images[0]['entry_id']}/preview"
    ).json()
    assert binary_preview["kind"] == "binary"
    assert base64.b64decode(binary_preview["bytes_base64"])[:3] == b"\xff\xd8\xff"


def test_recovery_creates_downloadable_files(client):
    analysis_id = _completed_demo(client)
    recoverable = client.get(
        f"/api/v1/analyses/{analysis_id}/entries", params={"entry_status": "recoverable"}
    ).json()["items"]
    assert recoverable
    entry_ids = [item["entry_id"] for item in recoverable]
    result = client.post(
        f"/api/v1/analyses/{analysis_id}/recover", json={"entry_ids": entry_ids}
    ).json()
    assert len(result["created"]) == len(entry_ids)
    record = result["created"][0]
    assert record["size_bytes"] > 0
    assert len(record["sha256"]) == 64

    listing = client.get(f"/api/v1/analyses/{analysis_id}/recoveries").json()
    assert listing["total"] == len(entry_ids)

    download = client.get(record["download_url"])
    assert download.status_code == 200
    assert len(download.content) == record["size_bytes"]
    assert "attachment" in download.headers["content-disposition"]


def test_recovery_rejects_ineligible_entries(client):
    analysis_id = _completed_demo(client)
    entries = client.get(
        f"/api/v1/analyses/{analysis_id}/entries", params={"search": "VERWRIT"}
    ).json()["items"]
    assert entries and not entries[0]["recoverable"]
    response = client.post(
        f"/api/v1/analyses/{analysis_id}/recover",
        json={"entry_ids": [entries[0]["entry_id"]]},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "nothing_recovered"


def test_reports_download_in_every_format(client):
    analysis_id = _completed_demo(client)
    json_report = client.get(f"/api/v1/analyses/{analysis_id}/reports/json")
    assert json_report.status_code == 200
    payload = json_report.json()
    assert payload["generator"] == "FATScope"
    assert payload["entries"]
    assert payload["findings"]

    csv_report = client.get(f"/api/v1/analyses/{analysis_id}/reports/csv")
    assert csv_report.status_code == 200
    text = csv_report.content.decode("utf-8-sig")
    assert "FILESYSTEM ENTRIES" in text
    assert "README.TXT" in text

    pdf_report = client.get(f"/api/v1/analyses/{analysis_id}/reports/pdf")
    assert pdf_report.status_code == 200
    assert pdf_report.content.startswith(b"%PDF-")
    assert len(pdf_report.content) > 5000
    assert "attachment" in pdf_report.headers["content-disposition"]


def test_upload_flow_rejects_unsupported_and_tiny_files(client):
    rejected = client.post(
        "/api/v1/analyses",
        files={"file": ("notes.txt", io.BytesIO(b"x" * 1024), "text/plain")},
    )
    assert rejected.status_code == 415

    tiny = client.post(
        "/api/v1/analyses",
        files={"file": ("tiny.img", io.BytesIO(b"x" * 10), "application/octet-stream")},
    )
    assert tiny.status_code == 422


def test_upload_of_a_raw_volume_image_is_analysed(client, raw_volume_image):
    with raw_volume_image.open("rb") as handle:
        response = client.post(
            "/api/v1/analyses",
            files={"file": ("volume.dd", handle, "application/octet-stream")},
            data={"case_id": "CASE-UPLOAD", "examiner": "Automated test"},
        )
    assert response.status_code == 201
    analysis_id = response.json()["id"]
    final = wait_for_completion(client, analysis_id)
    assert final["status"] == "completed", final
    summary = client.get(f"/api/v1/analyses/{analysis_id}/summary").json()
    assert summary["image"]["container"] == "raw_volume"
    assert summary["analysis"]["case_id"] == "CASE-UPLOAD"


def test_unsupported_image_reports_a_useful_failure(client):
    payload = io.BytesIO(bytes(range(256)) * 8)
    response = client.post(
        "/api/v1/analyses",
        files={"file": ("garbage.img", payload, "application/octet-stream")},
    )
    assert response.status_code == 201
    analysis_id = response.json()["id"]
    final = wait_for_completion(client, analysis_id)
    assert final["status"] == "failed"
    assert "FAT32" in final["error_message"]
    blocked = client.get(f"/api/v1/analyses/{analysis_id}/summary")
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["code"] == "analysis_not_ready"


def test_delete_removes_the_analysis(client):
    analysis_id = _completed_demo(client)
    assert client.delete(f"/api/v1/analyses/{analysis_id}").status_code == 204
    assert client.get(f"/api/v1/analyses/{analysis_id}").status_code == 404
    assert client.get(f"/api/v1/analyses/{analysis_id}/summary").status_code == 404


def test_unknown_analysis_returns_structured_error(client):
    response = client.get("/api/v1/analyses/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "analysis_not_found"

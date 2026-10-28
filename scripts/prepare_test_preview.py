"""Build a local administrator preview pinned to the named test project only."""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
source = (root / "admin.html").read_text(encoding="utf-8")
production_url = "https://iqopdxrnkmpdivzndkxq.supabase.co"
production_key = "sb_publishable_8jMegFjVcyhp1SIRZHosAQ_fVoxo8Nr"
test_url = "https://bgswafqssdmktnmyyqef.supabase.co"
# Public frontend key, never a service-role credential.
test_key = "sb_publishable_T3tT8KOmwNjkqFdbkNzHbg_WEZ9WdzB"
assert source.count(production_url) == 1, "Review administrator connection configuration first"
assert source.count(production_key) == 1, "Review administrator public key configuration first"
preview = source.replace(production_url, test_url).replace(production_key, test_key)
preview = preview.replace("<title>이로운과자점 주문관리</title>", "<title>테스트 전용 — 이로운과자점 주문관리</title>")
preview = preview.replace("운영 시스템입니다. 출고 처리 전 실제 재고 수량을 확인하세요.", "테스트 전용 · iroun-order-v2-test · 운영 데이터와 연결되지 않습니다.")
preview = preview.replace("운영 주문이 생성됩니다.", "테스트 주문이 생성됩니다.")
assert "iqopdxrnkmpdivzndkxq" not in preview, "Production project must never appear in this preview"
(root / ".preview").mkdir(exist_ok=True)
(root / ".preview/index.html").write_text(preview, encoding="utf-8")
(root / ".openai").mkdir(exist_ok=True)
hosting = root / ".openai/hosting.json"
manifest = {"static": {"directory": ".preview"}}
if hosting.exists():
    assert json.loads(hosting.read_text()) == manifest, "Do not overwrite an existing hosting configuration"
else:
    hosting.write_text(json.dumps(manifest) + "\n")
print("Created test-only local preview in .preview/index.html")

# 이로운과자점 주문관리

운영 코드의 기준은 이 저장소 main입니다. 과거 대화나 테스트 화면을 운영본으로 사용하지 않습니다.

| 진입점 | 역할 |
| --- | --- |
| admin.html | 관리자 로그인·주문·송장·사진·재고 |
| customer.html | 고객 주문 신청 |
| ml/index.html | 기존 ML Apps Script 화면으로 연결 |
| index.html | 진입 안내 |
| admin-test.html, admin-drive-test.html | 예전 주소 호환용. admin.html로 이동 |

관리자는 [유지관리 안내](docs/MAINTENANCE_KO.md), AI는 [AGENTS.md](AGENTS.md)를 먼저 읽습니다.
과거 점검 문서는 당시 기록이며 현재 배포 상태를 보장하지 않습니다.

## 확인 명령
```sh
npm ci
npx playwright install --with-deps chromium
npm run check
npm test
python3 scripts/prepare_test_preview.py
```

테스트는 운영 DB를 수정하지 않습니다. `.preview/index.html`은 별도 테스트 프로젝트에만 연결됩니다.
브라우저 테스트는 기본 Playwright Chromium을 사용하며 설치된 브라우저를 쓰려면 CHROMIUM_PATH를 지정합니다.
GitHub Actions가 push/PR마다 같은 검사를 수행합니다.

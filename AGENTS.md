# AI 작업 시작 안내

먼저 README.md와 docs/MAINTENANCE_KO.md를 읽고, 요청과 관련된 파일만 여세요.
이 저장소는 공개 저장소입니다. 고객 주문·연락처·사진·사업계획서·실제 배합·비밀키는 커밋하지 않습니다.

## 작업 원칙
- 운영 관리자 화면은 admin.html 하나입니다. scripts/admin/*.js는 순서대로 읽는 일반 스크립트이며 전역 함수와 상태를 공유합니다. type=module, async, defer를 임의로 추가하지 마세요.
- scripts/admin/start.js가 마지막에 인증 이벤트를 등록하고 화면을 시작합니다. 다른 파일에서 showApp()을 호출하지 마세요.
- 제품 가격은 products 데이터, 인쇄 재료는 scripts/order_materials.js, 기존 출고 재고는 inventory 계열, 새 생산재고는 stock2 계열입니다. 서로 자동 동기화된다고 가정하지 마세요.
- 일반 과자집과 크리스마스 과자집은 별도 상품입니다. 시즌 변경을 일반 상품에 덮어쓰지 마세요.
- 주문 생성으로 재고를 차감하지 않습니다. 출고 RPC, 사진 권한, ML 거래처 범위, 기존 주문번호를 보존합니다.
- SQL 파일은 배포 이력과 복구 근거입니다. 이름이 오래됐다는 이유로 삭제·재실행하지 마세요. DB 변경은 별도 마이그레이션과 격리 테스트로 검증합니다.
- 기존 고객 데이터로 시험 주문·출고·삭제를 수행하지 마세요. 테스트는 가짜 데이터와 격리 PGlite를 사용합니다.

## 완료 확인
1. npm ci
2. npx playwright install --with-deps chromium (최초 1회)
3. npm run check && npm test
4. python3 scripts/prepare_test_preview.py
5. diff 검토 후 PR과 CI 확인. 수정 내용, 검증 범위, 미확인 사항을 보고합니다.

브라우저 실행이 환경 권한으로 막히면 통과로 표시하지 마세요. GitHub Actions 결과로 보완합니다.
작업 종료 때 docs/CHANGELOG.md에 변경 이유와 확인 결과를 짧게 남깁니다.

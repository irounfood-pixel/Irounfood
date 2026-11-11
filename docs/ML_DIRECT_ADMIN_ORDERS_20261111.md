# ML 관리자 직접 등록 주문 누락 대응 (2026-11-11)

## 확인 결과 (읽기 전용 운영 DB 조회)
- **260080**: 발송일 2026-11-11, 거래처 `ML`, 출고완료, 송장 있음, 사진 4장. `partner_order_rows` 연결이 0건이어서 기존 ML 웹앱에는 나타나지 않음.
- **260077**: 발송일 2026-11-20, 거래처 `ML`, 아직 송장/사진 없음. 같은 구조로 조회에서 빠짐.
- 기존 웹앱 `getMLPortalData`는 거래처 Google Sheet 행만 반환하며, 관리자 `orders.partner_type='ML'` 자체는 조회하지 않음.
- 웹앱의 '오늘'은 발송일 기준이므로 260080은 날짜 문제도 아님.

## 변경 구성
1. `supabase/ml_portal_direct_admin_orders.sql`: 기존 시트 연결이 없는 `ML` 관리자 주문만 **읽기 전용**으로 제공하는 인증된 RPC. 기존 ML 사진 내보내기 manifest에도 같은 범위를 포함. 다른 거래처, 삭제/취소 주문, 시트 승인 주문 중복 제외.
2. `partner-portal-manage` Edge Function: 기존 ML 포털 토큰을 확인한 `status` 요청에만 `direct_orders`를 추가. 다른 동작에 영향 없음.
3. `ml_portal_order_actions.gs`: API 결과를 기존 포털 데이터 뒤에 별도 음수 가상 행으로 추가. 실제 Google Sheet 행을 생성하거나 수정하지 않음.
4. `ml_portal_template.html`: 가상 행은 조회 전용. 편집·삭제 버튼 없음. 그룹핑/송장/박스/사진/엑셀 출력은 기존 코드 재사용.

## 검증
- 2026-11-11 운영 Supabase에서 읽기 전용 쿼리로 누락된 260080 / 260077 분류 확인.
- 스테이징 DB에서 위 SQL 전체가 파싱/컴파일됨을 트랜잭션 `BEGIN; ALTER TABLE ... ADD COLUMN partner_type; [SQL]; ROLLBACK;`으로 검증. 스테이징이 운영보다 오래된 테이블 구조여서 임시 컬럼 필요. **스테이징 변경은 롤백**됨.
- `mlDirectOrderRows_` 순수 함수 실행: 2개 상품 → 2개 15열 가상 행, 동일 주문 ID, 사진 4, 송장 입력, 행 번호 음수, `readonly_direct` 확인.
- `tests/ml_direct_admin_orders.test.cjs`로 회귀 검증 추가. 운영 Google Apps Script 화면 통합 검증 및 실제 Drive 사진 다운로드는 **배포 후 필요**.

## 배포 순서 (운영 반영 전 검토 필수)
1. 운영 DB의 `ml_portal_photo_manifest()` 함수를 백업하고 안전한 사전 점검 수행. SQL 파일을 운영 DB에 적용 (주문/송장/사진 테이블의 **기존 행에 대한 쓰기 없음**).
2. `partner-portal-manage` Edge Function의 새 버전을 배포.
3. **기존 ML Apps Script 프로젝트에 두 변경 부분만 적용**. GitHub 원본 `ml_portal_template.html`에는 배포용으로 그대로 사용할 수 없는 설정 값 자리표시자가 있으므로 전체 덮어쓰기 금지. 기존 배포의 HTML/공유 링크 토큰과 다른 앱 스크립트 코드를 보존할 것.
4. 기존 웹앱 배포를 **새 버전으로 수정**하여 고정 ML URL을 유지. 새로운 URL로 변경하거나 다른 Apps Script 프로젝트를 만들지 말 것.
5. ML 포털의 오늘 목록에서 `260080` 송장·사진 4장 확인; `2026-11-20`에서 `260077` 표시 확인.
6. 종전 ML 시트 승인 주문은 중복 표시되지 않는지, 비ML 거래처 주문/사진은 노출되지 않는지, 사진 포함/미포함 엑셀 둘 다 확인.
7. 관리자 주문·재고·출고 상태와 ML 거래처 시트의 원본 행 수/UID가 변경되지 않았는지 대조.

## 롤백
- ML Apps Script는 이전 버전(기존 웹앱 배포)을 선택하고 Edge Function은 이전 배포로 되돌림.
- 신규 RPC는 더 이상 호출되지 않으면 제거 가능. `ml_portal_photo_manifest`는 적용 전 백업한 원본 정의로 복구.
- 현재 코드 변경은 PR 브랜치에만 있으며, **운영 앱/운영 DB에 아직 배포되지 않음**.

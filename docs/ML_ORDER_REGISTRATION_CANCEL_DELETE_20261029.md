# ML 거래처 주문 상태·수정·취소·완전 삭제 개발 메모 (2026-10-29)

## 사용자 요청 및 상태 전이

- 관리자와 ML 거래처 모두 본인이 접근 가능한 거래처 주문을 조회하고 수정, 승인 취소, 삭제할 수 있어야 한다.
- 승인 이전 주문의 표시 상태는 **등록**. 기존 `승인대기` 행도 이전 버전 호환을 위해 등록과 동일하게 처리한다.
- **등록 → 승인**: 관리자만 승인. `orders`에 정식 주문이 생성되어 `주문접수` 상태가 된다.
- **승인 → 승인 취소 → 등록**: 정식 주문은 `취소` 상태로 보존하고 관련 거래처 상품행 **전부** `등록` 상태로 원복한다. 다시 수정·재승인할 수 있다.
- **등록 → 수정**: 동일 `source_uid`로 주문일·발송일·상품명·수량·수령인·연락처·배송지·요청사항 변경. 별도 중복 주문 생성 방지.
- **등록 → 완전 삭제**: `partner_order_rows` 데이터는 실제 삭제한다. UID만 남긴 비식별 삭제 방지키로 다음 자동 동기화에서 삭제 주문이 되살아나지 않도록 한다.
- **출고완료 주문은 승인 취소/삭제 불가**: 기존 출고 및 재고 이력 보호. 송장번호/박스 데이터는 취소된 정식 주문 기록에 남으나 거래처 시트의 등록 행에는 미표시.
- 정식 주문(`orders`)의 취소 기록과 기존 업로드 사진은 감사·정산 추적을 위해 별도 보존. **등록 행의 완전 삭제가 정식 주문 이력/사진까지 지우는 것은 아님**.

## 접근 통제

- 관리자: 관리자 로그인 후 `private.is_admin()` 검증. 모든 거래처의 등록·승인 데이터 관리.
- 거래처: 자신에게 할당된 `sheet_id`의 소유/접근 권한을 **기존 WebApp 서버에서 확인한 뒤** 서버 전용 함수를 실행. `partner_sheet_manage`는 토큰 해시와 시트 ID를 검증하며 `service_role`만 호출 가능.
- **중요**: 기존 WebApp 프런트엔드에 동기화 토큰이나 Supabase 서비스 키를 노출하면 안 됨. 공유 시트에 관리자 소유 독립형 스크립트의 비밀 토큰을 복사해서도 안 됨.
- 다른 거래처 행을 UID로 넘겨도 `sheet_id`로 범위를 강제해야 한다.

## 이 브랜치에 작성한 변경

1. `supabase/migrations/20261029_partner_registered_cancel_delete_staging.sql`: 등록 상태 추가, 승인 취소 시 등록 복귀 트리거, 관리자·거래처별 서버 RPC, 삭제키, 승인 재처리 및 동기화 보완.
2. `supabase/functions/partner-sheet-ingest/index.ts`: `action: 'sync' | 'cancel' | 'delete'` 처리, 서버 측 토큰 검증, 삭제된 UID 조회.
3. `apps_script/partner_sheet_sync.gs`: 승인 취소 후 행 보호 해제, 취소된 송장/박스 미러 초기화, 서버가 명시적으로 삭제한 행을 공유 시트에서 제거.
4. `admin.html`: 등록 목록에서 수정(거래처 시트 이동)·완전 삭제, 승인 목록에서 승인 취소 → 등록 버튼.

## 서버 API 예시 (관리자 소유 Apps Script 서버에서만)

```json
{"sheet_id":"<현재 거래처의 시트 ID>","action":"cancel","source_uid":"<행 UID>"}
```

```json
{"sheet_id":"<현재 거래처의 시트 ID>","action":"delete","source_uid":"<행 UID>"}
```

POST `/functions/v1/partner-sheet-ingest`, Authorization 헤더는 **서버 내** `SHEETS_CONFIG` 토큰으로 설정. 반환 `deleted_uids`를 독립형 동기화 스크립트가 반영한다. 등록 상태 변경은 기존 시트 A:H 수정+동기화로 처리한다.

## 확인된 테스트

- 테스트 프로젝트 `bgswafqssdmktnmyyqef`에서 전체 신규 SQL을 트랜잭션 안에서 실행해 문법 확인 및 ROLLBACK.
- 실제 기존 테스트용 승인 행을 트랜잭션 안에서 `승인 → 등록 → 완전 삭제`로 전환.
- 이전에 삭제한 UID를 다시 `partner_sheet_ingest`로 전송해도 재등록되지 않음 확인.
- **모든 테스트 동작과 스키마 변경은 ROLLBACK**. 운영 `iqopdxrnkmpdivzndkxq` 및 기존 주문/재고/사진 데이터는 수정하지 않음.

## 실제 운영 적용 전 남은 작업 (필수)

1. 현재 ML 거래처 WebApp 배포 프로젝트의 원본 소스 확인. 이것은 GitHub 저장소의 옛 `partner_sheet_menu.gs`/HTML과 별개의 Google Apps Script 배포다.
2. 기존 WebApp에서 ML 사용자 로그인/시트 접근 검사 구조 확인 후, 거래처용 수정·승인 취소·완전 삭제 버튼을 추가. **서버 소유 자격증명으로만** Edge API 호출.
3. Google Apps Script 관리자 독립형 동기화 프로젝트와 ML WebApp 프로젝트에 변경 코드를 적용해 **테스트 배포**. 기존 배포 URL의 권한/세션을 보존.
4. 테스트 시트에서 두 상품 승인, 부분 상품행 삭제 금지, 다품목 승인 취소, 잠금 해제, 등록 수정, 삭제/재동기화, 다른 거래처 차단, 출고완료 차단 검증.
5. 테스트 Edge Function과 SQL을 별도 테스트 환경에 실제 적용해 HTTP/앱 종단 간 검증한 뒤에만 운영 스키마/함수/페이지 변경.
6. 기존 관리자 화면 주문/출고/송장/사진 원본 다운로드 및 엑셀 기능 회귀 테스트 후 `main` 병합.

**이 PR은 검토용으로 유지한다. 운영 DB 마이그레이션, 운영 Edge/Google WebApp 배포 및 GitHub main 병합은 하지 않았다.**

## 후속 작업: 실제 ML 소스 확인 및 테스트 서버 준비

- 실제 ML 웹앱 원본은 `이로운과자점 ML 거래처 주문화면` 독립형 프로젝트의 `Code.gs`이며, 주문입력 시트는 `1lgXZtokJqUfvBibMmXgEPfu7KjTCteIigU_NcVYndfM`이다. 원본 프로젝트와 기존 배포 코드는 이번 작업에서 변경하지 않았다.
- `ml_portal_order_actions.gs`와 `.client.js`, `scripts/patch_ml_portal.cjs`를 추가했다. 기존 HTML의 사진 원본·최대 400×300 표시·14열 빈 양식·업로드 코드를 보존하며 카드에 승인 취소/완전 삭제 버튼을 연결한다.
- 두 독립형 프로젝트가 기존 동일 UID를 읽도록 동기화 코드가 기존 메타데이터의 가시성만 `PROJECT → DOCUMENT`로 변경한다. UID 자체는 유지한다. UID는 권한이나 비밀키로 사용하지 않는다.
- 새 `partner-portal-manage` Edge/RPC는 별도 `private.partner_portal_tokens` 자격증명을 사용한다. ML 시트만 조회/취소/삭제하며 동기화 토큰과 서비스키를 프런트엔드에 전달하지 않는다. 취소/삭제 시 주문 8개 필드와 `updated_at`을 DB 잠금 안에서 비교한다.
- 완전 삭제한 UID를 화면에서도 제외한다. 실제 시트 행은 기존 관리자 동기화 프로젝트가 다음 동기화 때 정리한다. 같은 내용의 다른 UID 주문은 유지한다.
- 테스트 프로젝트 `bgswafqssdmktnmyyqef`에 SQL 변경과 `partner-sheet-ingest` v3, `partner-portal-manage` v1을 실제 배포했다. 운영 프로젝트는 조회만 했다.
- `node --test tests/*.test.cjs`: 9건 통과. SQL 회귀 검증: 승인, 다품목 동시 등록 복귀, 출고완료 차단, 등록 수정, 삭제/재동기화, 다른 시트 인증 차단, 오래된 스냅샷 차단, 재고 불변을 트랜잭션 내 검증 후 ROLLBACK.
- 운영 기준선 조회: orders 43건, partner_order_rows 4건, order_items 77행. 운영 주문/재고 수정 없음.

### 현재 이어갈 위치

테스트 Apps Script 프로젝트 `ML 주문상태 테스트 · 운영 분리 20261029`에 코드 저장 완료:

`https://script.google.com/home/projects/1pLQ_s_di7EoXLLS_sqsL632nYh9jmLKT4HKi8Tsc0fLab3RhgkGpST-Q/edit?hl=ko`

테스트 원본은 `scripts/prepare_ml_staging.cjs`로 생성한다. 실제 ML 시트 ID와 운영 Supabase URL을 제외했으며, 새 가상 주문 시트만 생성한다. 사진 다운로드 테스트는 새 테스트 시트에 첨부사진이 없어 0장으로 제한한다. 기존 운영 사진 다운로드 회귀 검증은 별도로 남아 있다.

`initializeMLStaging` 실행 시 Google 추가 본인 확인은 완료했다. 새 테스트 앱 OAuth 권한 승인이 남아 있어 초기화는 아직 완료되지 않았다. 새 권한 부여는 사용자가 직접 진행해야 한다. 웹앱 URL도 아직 생성하지 않았다.

승인 후 순서:

1. 초기화 실행 로그의 `sheet_id`, `portal_hash`, `sync_hash`만 조회한다. 원문 토큰은 Script Properties에만 보관하며 출력하지 않는다.
2. **테스트 DB만** `partner_sheet_sources`, `private.partner_sheet_tokens`, `private.partner_portal_tokens`에 해당 테스트 시트/해시를 등록한다. 기존 ML 토큰은 교체하지 않는다.
3. `syncAllPartnerSheets`를 수동 실행하고 **소유자만 접근하는 테스트 웹앱**으로 배포한다. 테스트 자동 트리거는 설치하지 않는다.
4. 테스트 관리자 승인과 ML 화면 버튼 취소/수정/삭제를 실제 브라우저에서 확인한다. 원본 사진/양식/업로드 회귀 검증을 완료한 뒤 운영 전환을 판단한다.

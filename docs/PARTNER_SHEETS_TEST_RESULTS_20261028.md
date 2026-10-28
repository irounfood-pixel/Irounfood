# 거래처 Google Sheets 연동 실제 검증 기록 — 2026-10-28

## 범위와 운영 보호

- 개발 브랜치: `feature/partner-sheets-20261028`, 기존 Draft PR #1 유지.
- 대상 DB: 테스트 `bgswafqssdmktnmyyqef`만 사용.
- 대상 시트: `1cvd7XNsGMUfdMWudbqD4LFsBwIh6sTIdn8PWe_k4QNM`만 수정.
- 운영 `iqopdxrnkmpdivzndkxq`, GitHub `main`, 원본 템플릿은 변경하지 않음.
- 검증용 파일은 소유자만 접근하며 외부 거래처에 공유하지 않음.

## 실제 설치

- 관리자 독립형 프로젝트: `11YiQMRlv7VKmLdqzyZx-uRI0okEWKPi-SVlWV6g_7PfGwCX5GD5_xjg_`.
- 관리자 `partner_sheet_sync.gs`, `partner_sheet_setup.gs` 저장 및 Google 실행 권한 승인 완료.
- `preparePartnerTestConfig` 성공. 원본 토큰은 관리자 Script Properties에만 저장. DB에는 SHA-256 해시만 등록.
- 검증용 `partner_sheet_sources`와 전용 토큰을 활성화.
- 편집 감지 `onPartnerSheetEdit` 및 5분 주기 `syncAllPartnerSheets` 트리거 설치.
- 시트 바인딩 프로젝트: `1O1fyBGhPNoC2fmE3yvLI4wmDLirhc1XOr5QdYfQBYjXQqsvQ7vubWGl6`.
- 엑셀 메뉴 GS/HTML 저장, 시트 메뉴 표시 확인. `@OnlyCurrentDoc`로 현재 파일만 접근하도록 제한.
- 시트 바인딩 코드에는 관리자 토큰이나 service-role 키가 없음.

## 실제 확인한 동작

| 검증 | 확인 결과 |
|---|---|
| 브라우저 수기 입력 → 설치형 편집 트리거 → Edge Function → DB | 가상 수령인 주문이 실제 승인대기로 접수됨 |
| 승인 전 수량 수정 | 과자집 3 → 4, 기존 접수 ID 유지 |
| 동일 행 반복 전송 | 상품 2개 행은 2개 접수 ID만 유지 |
| 상품 2개를 한 주문으로 승인 | 테스트 DB의 `authenticated` 관리자 역할로 승인 RPC 실행, 정식 주문 1건·상품 2행·총 9개 생성 |
| 정식 주문 상태 | `주문접수` |
| 승인 접수 재승인 | 오류로 거부, 정식 주문 1건 유지 |
| 승인 후 시트 수량 변경 | 초코스틱을 99로 바꿔도 정식 주문은 5 유지; 시트는 5로 복원 |
| 시트 I:N → 송장/박스 DB | `TEST-001,TEST-002`, 5종 수량 1·2·3·4·5 반영 |
| 여러 상품 행의 박스 중복 합산 | 주문별 출고정보 1행, 수량이 2배로 합산되지 않음 |
| 주문 승인 시 재고 | 총 수량 6, 재고 이력 5행으로 전후 동일; 출고완료는 실행하지 않음 |
| 행 이동 | UID 유지. 내용이 같아도 DB 원본 행 번호가 새 위치로 갱신되도록 수정 후 확인 |
| 보호 설정 | I:N 전체 열, A1:N1, 승인된 2개 행 A:H, 접수현황 탭에 소유자 전용 보호 확인 |
| 테스트 시트 상품 목록 | 테스트 DB의 활성 상품 12종과 일치하도록 수정 |
| 토큰 없는 HTTP 요청 | 실제 Edge Function 401 응답 |
| 5분 주기 실행 | Google 실행 기록에서 23:19:50, 23:24:50, 23:29:50, 23:34:50 시간 기반 실행 완료 확인 |
| API 추가 행의 보완 접수 | 편집 이벤트 없이 복사한 4행이 별도 UID의 승인대기로 자동 등록됨 |
| 동일 배송정보의 별도 주문 | 기존 승인 주문과 같은 내용의 새 행도 별도 승인대기로 유지; 자동 병합되지 않음 |

승인은 **서버 RPC 검증**이다. 관리자 웹페이지에서 로그인하여 승인 버튼을 누른 검증으로 표현하면 안 된다.

## 발견하여 수정한 오류

1. 행 UID 저장 범위 오류: 숫자로 지정한 사각 범위에 메타데이터를 붙이면 Google이 거부했다. `sheet.getRange(row+':'+row)`로 수정하여 실제 접수를 확인했다.
2. 승인대기 행 이동 시 원본 행 번호가 갱신되지 않았다. `partner_sheet_ingest`의 충돌 갱신 조건에 `source_row` 변경을 포함했다. 테스트 DB의 해당 함수만 교체했고 권한/RLS는 유지했다.
3. 승인 후 원본 행과 접수현황을 시트에서 편집할 수 있었다. 자동 동기화 후 승인 행 A:H와 접수현황을 소유자만 편집하도록 보호했다. I:N 보호는 행 추가에도 적용되도록 전체 열로 확장했다.
4. 시트에만 존재하거나 이름이 다른 상품이 있었다. 테스트 시트에서만 활성 상품 목록과 맞췄다. 원본 템플릿과 운영 상품은 그대로다.

## 아직 끝나지 않은 검증

- 관리자 웹 로그인: 테스트 계정 로그인 시 `Invalid login credentials`가 반환됨. 계정이나 비밀번호를 변경하지 않았으며 재입력이 필요함.
- 관리자 웹 승인 버튼·반려 버튼·송장/박스 편집 UI: 로그인 후 실제 검증 필요.
- 엑셀 메뉴의 첫 실행 Google 승인: 별도 시트 바인딩 앱의 승인 과정에서 대기 중.
- 빈 양식/주문내역 `.xlsx` 실제 다운로드, 파일 업로드 미리보기, 중복 재업로드, 정상적인 동일 내용 재주문 구분: 미검증.
- 다른 거래처 계정으로 A:H 편집·I:N 거부·승인 행 거부, 다른 파일 접근 거부: 별도 계정으로 검증하지 않음. 보호/공유 메타데이터 확인과 실제 타 계정 테스트를 구분해야 함.
- 행 삭제·복사, 큰 주문의 400행 분할과 박스 정보, 재시도/장애 복구 등 경계 조건은 추가 검증 필요.
- 기존 Google Sheets 양방향 동기화의 실제 회귀 검증은 아직 미실시. 기존 운영 코드와 데이터는 변경하지 않음.

## 남겨 둔 테스트 데이터

- 가상 수령인: `연동검증_수기A`, 연락처 `010-0000-0000`, 실제 배송 금지 가상 주소.
- 정식 테스트 주문 ID: `b04bb2f3-0c49-4e69-9156-1616ed5a3941`.
- 주문입력 2~3행: 초코스틱 5, 과자집 4 (승인).
- 주문입력 4행: 5분 보완 동기화 검증을 위해 API로 복사한 동일 내용의 신규 행.
- 기존 테스트 주문/상품/재고는 삭제하지 않음. 운영 데이터는 건드리지 않음.

## 로컬 관리자 검증 화면

개발 브랜치 `admin.html`도 운영 주소를 사용하므로 그대로 로그인 테스트하면 안 된다.

```bash
python scripts/prepare_test_preview.py
sites-preview start /absolute/path/to/Irounfood
node --test tests/partner_sheet_sync.test.cjs
```

생성되는 `.preview/index.html`은 테스트 프로젝트만 연결하고, 운영 프로젝트 ID가 남아 있으면 생성을 중단한다. 생성 파일과 미리보기 설정은 Git에서 제외한다. 이 작업은 별도 사이트 배포가 아니다.

단위 회귀 테스트 4건 통과: 전체 행 메타데이터 범위, 이동 UID 유지, 중복 UID 재발급, 한국식 날짜/불가능 날짜 검증.

## 운영 전환 조건

남은 실제 검증을 완료한 뒤 적용 SQL·Edge Function·관리자 화면·시트 보호·기존 동기화 영향 범위를 검토한다. 그 전에는 운영 DB 반영 및 main 병합을 하지 않는다.

참고: [Google 행 메타데이터](https://developers.google.com/apps-script/reference/spreadsheet/range#addDeveloperMetadata(String,String,DeveloperMetadataVisibility)), [현재 문서 권한 제한](https://developers.google.com/apps-script/guides/services/authorization).

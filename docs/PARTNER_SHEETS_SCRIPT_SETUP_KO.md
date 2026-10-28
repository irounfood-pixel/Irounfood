# 이로운과자점 — 테스트 Google Sheets 자동 동기화 설치 안내

**적용 범위:** 테스트 Supabase `bgswafqssdmktnmyyqef` + 비공개 연동검증용 Google Sheet. 실제 운영 프로젝트 `iqopdxrnkmpdivzndkxq`와 GitHub `main`에는 적용하지 않습니다.

**검증용 시트:** https://docs.google.com/spreadsheets/d/1cvd7XNsGMUfdMWudbqD4LFsBwIh6sTIdn8PWe_k4QNM/edit

**서버 함수 주소 (테스트 전용):**
`https://bgswafqssdmktnmyyqef.supabase.co/functions/v1/partner-sheet-ingest`

## 1. 준비된 상태

- 테스트 Supabase 복구 및 `partner_sheet_v2_review_fixed_20261028` 적용
- 테스트 Edge Function `partner-sheet-ingest` 활성
- 검증용 Google Sheets 복사·테스트 DB `partner_sheet_sources` 등록 완료
- 검증용 소스는 `enabled=false`, 비밀 토큰은 아직 미등록
- 14열(A~H 거래처, I~N 관리자), 상품 드롭다운, 접수현황 탭 확인
- SQL 수준 신규 입력·수정·재전송·승인·송장/박스 저장 테스트 통과

## 2. Google 계정에서 관리자 소유 **독립형** Apps Script 설치

이 작업은 실제 Google 계정의 승인/실행 권한이 필요하므로 연결된 Drive 도구가 자동으로 대신할 수 없습니다.

1. 거래처에 공유하지 않을 **관리자 Google 계정**으로 [Apps Script](https://script.google.com/home/projects/create)에 접속하여 새 프로젝트를 만듭니다.
2. 프로젝트명을 `이로운과자점-테스트-자동동기화`처럼 지정합니다.
3. 다음 두 파일의 코드를 이 관리자 프로젝트에 각각 복사합니다.
   - [partner_sheet_sync.gs](https://github.com/irounfood-pixel/Irounfood/blob/feature/partner-sheets-20261028/apps_script/partner_sheet_sync.gs) — 시트 편집 감지/5분 보완 동기화
   - [partner_sheet_setup.gs](https://github.com/irounfood-pixel/Irounfood/blob/feature/partner-sheets-20261028/apps_script/partner_sheet_setup.gs) — 비밀 토큰 생성
4. 프로젝트 설정(톱니바퀴) → **스크립트 속성**에서 다음 **2개**만 입력합니다.

| 속성 이름 | 값 |
|---|---|
| `PARTNER_TEST_SHEET_ID` | `1cvd7XNsGMUfdMWudbqD4LFsBwIh6sTIdn8PWe_k4QNM` |
| `EDGE_URL` | `https://bgswafqssdmktnmyyqef.supabase.co/functions/v1/partner-sheet-ingest` |

5. 저장한 후 함수 선택 메뉴에서 `preparePartnerTestConfig`를 **한 번** 실행합니다. Google 계정 권한 승인 화면이 나오면 관리자 계정에서 확인합니다.
6. **실행 로그의 `SHA-256 토큰 해시`만** 기록합니다. 원본 토큰은 관리자 프로젝트의 Script Properties(`SHEETS_CONFIG`)에 자동 저장됩니다.
7. SHA-256 해시(64자리 16진수)만 ChatGPT에 알려주면 테스트 Supabase의 `private.partner_sheet_tokens`에 해당 해시를 등록하고 테스트용 `partner_sheet_sources.enabled=true`를 설정할 수 있습니다.
8. **7번이 완료되고 나서만** 관리자 스크립트에서 `installPartnerSheetTriggers`를 실행합니다. 처음 실행 시 Google Sheet 편집 권한과 트리거 권한이 요구될 수 있습니다.

**주의:** `SHEETS_CONFIG` 전체, 원본 비밀 토큰, service_role 키는 채팅·GitHub·거래처 Google Sheets에 절대 게시하지 않습니다. 관리자용 독립형 Apps Script 프로젝트도 거래처와 공유하지 않습니다.

## 3. 거래처용 시트에 엑셀 메뉴 설치

동기화 토큰을 **포함하지 않은 코드만** 거래처 시트에 연결합니다.

1. 검증용 Google Sheets 열기 → **확장 프로그램 → Apps Script**.
2. JavaScript(GS) 파일에는 [partner_sheet_menu.gs](https://github.com/irounfood-pixel/Irounfood/blob/feature/partner-sheets-20261028/apps_script/partner_sheet_menu.gs) 내용을 넣습니다.
3. **HTML** 파일을 하나 만들고 파일 이름을 `partner_sheet_excel`로 지정한 뒤 [partner_sheet_excel.html](https://github.com/irounfood-pixel/Irounfood/blob/feature/partner-sheets-20261028/apps_script/partner_sheet_excel.html) 내용을 넣습니다.
4. 저장 후 Google Sheets를 새로고침하면 상단에 **이로운과자점 → 엑셀 업로드 / 다운로드** 메뉴가 표시됩니다.
5. `I:N`열 관리자 전용 보호 범위가 실제로 관리자를 제외한 거래처 계정에 대해 편집 불가인지 확인합니다. 업로드 코드는 `A:H`에만 데이터를 기록하도록 수정했습니다.

## 4. 테스트 시나리오

**반드시 가짜 수령인·연락처·주소로만 테스트합니다.**

1. A:H에 날짜·상품·수량·수령인·연락처·배송지 입력 완료 → 관리자 승인 대기 1행 생성
2. 동일 행 재수정/동기화 → 같은 승인 대기 행 갱신, 중복 생성 없음
3. 다른 상품으로 둘째 행 입력 → 관리자가 2행을 묶어 주문 1건으로 승인
4. 승인 뒤 거래처가 시트 A:H를 수정 → 정식 운영 주문 변경되지 않음
5. 관리자 전용 I:N 입력 → 쉼표 송장번호 및 5종 박스가 주문별 1회 반영
6. 빈 양식 다운로드·현재 주문 다운로드·동일 엑셀 재업로드(중복 건너뛰기)
7. 거래처 편집 권한 테스트: I:N 수정 불가, 다른 거래처 파일 조회 불가
8. 관리자 웹페이지 브라우저 실제 로그인 및 승인 동작 확인

**주의:** Apps Script 또는 API로 행을 추가하면 Google Sheets `onEdit` 트리거가 자동 발생하지 않습니다. 5분 주기 동기화가 이를 보완합니다. 실제 실행 간격은 Google 환경에 영향을 받습니다.

관련 Google 공식 문서:
- [설치형 트리거](https://developers.google.com/apps-script/guides/triggers/installable)
- [스크립트 속성](https://developers.google.com/apps-script/guides/properties)

## 5. 운영 전환 체크포인트

- 개발 브랜치와 테스트 프로젝트에서 위 시나리오의 실제 종단 간 검증이 끝나기 전에는 **운영 main 병합 금지**
- 테스트 소스 ID와 원본 운영/고객용 Sheet ID 혼동 금지
- 테스트 비밀 토큰을 운영 프로젝트로 복사하지 않기
- 고객에게 테스트 검증용 파일을 공유하지 않기
- 운영 DB의 기존 주문·상품·재고는 삭제/초기화 금지

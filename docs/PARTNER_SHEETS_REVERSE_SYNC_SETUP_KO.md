# 거래처 Google Sheets 자동 역동기화 — 테스트 적용 및 최종 연결
2026-10-29 · 이로운과자점 / 이로운교육

## 현재 구현됨 (테스트 환경)
- 테스트 Supabase: `bgswafqssdmktnmyyqef`
- 테스트 시트: https://docs.google.com/spreadsheets/d/1cvd7XNsGMUfdMWudbqD4LFsBwIh6sTIdn8PWe_k4QNM/edit
- 테스트 API: `https://bgswafqssdmktnmyyqef.supabase.co/functions/v1/partner-sheet-ingest` (v2)
- `partner_sheet_status`: 시트 ID + 비밀 토큰 해시 검증 후, 해당 시트에 연결된 승인 주문의 송장/박스/사진 개수 반환
- 테스트 시트 `주문입력!I:N`: 송장, 아이스박스 소/중/대, 종이박스 중/대
- 테스트 시트 `주문입력!O`: 첨부사진 수 (실제 사진 파일은 시트에 넣지 않음)
- 기존 주문데이터 변경 없음. 스크립트 템플릿은 GitHub에 반영됨.

## 반드시 남아 있는 설치 작업
기존 Apps Script 프로젝트의 내용을 바꾸고 트리거를 재설치해야 **5분 주기 자동 동기화가 시작됩니다**.
Google Drive 커넥터로 Google Sheets 데이터는 변경할 수 있어도 Apps Script 파일의 실행 코드와 트리거는 직접 수정할 수 없습니다.

1. 테스트 시트 소유 Google 계정으로 **기존 관리자 소유 독립형 Apps Script 프로젝트**를 여십시오. 새 프로젝트로 만들지 마세요. 기존 `IROUN_PARTNER_SOURCE_UID_V2` 행 메타데이터의 프로젝트 범위를 보존해야 중복 주문을 방지할 수 있습니다.
2. GitHub의 [새 partner_sheet_sync.gs](https://github.com/irounfood-pixel/Irounfood/blob/main/apps_script/partner_sheet_sync.gs) 전체 내용으로 해당 독립형 스크립트 코드 교체. 공유 거래처 시트에 서버 토큰/코드를 바인딩하지 마세요.
3. **스크립트 속성의 기존 `SHEETS_CONFIG`를 절대 삭제/공유하지 마세요.** `EDGE_URL`은 검증용 테스트 API URL을 유지합니다. 토큰 원문은 로그, 고객 시트, GitHub에 넣지 않습니다.
4. 관리자 계정으로 `installPartnerSheetTriggers()` 한 번 실행 및 권한 승인. 이 함수가 `onPartnerSheetEdit`와 `syncAllPartnerSheets` 설치형 트리거를 재설정하고 최초 동기화를 실행합니다.
5. 테스트 시트 `주문입력` O열 사진 개수가 갱신되는지 확인합니다. 관리자 **테스트** 페이지에서 해당 주문에 사진 1장을 올리고, 다음 주기(약 5분, 정확한 초 단위 보장 아님)에 O열의 개수가 증가하는지 검사합니다.
6. I:N 송장/박스는 관리자 DB에 저장한 값으로 반영되어야 하며, 시트 I:N을 수동 수정해도 관리자 DB를 덮어쓰지 않아야 합니다.
7. 다른 거래처의 시트로 주문정보가 넘어가지 않는지 권한/시트 ID 확인 후에만 운영 전환합니다.

## 운영 전환 전 확인
- 운영 Supabase 프로젝트 `iqopdxrnkmpdivzndkxq`에는 아직 등록된 거래처 시트와 토큰이 없습니다.
- 테스트 시트의 기존 예시 데이터를 운영에 연결하지 마세요.
- 운영에는 **별도의 거래처 시트 파일**, 시트 ID, 안전한 장기 토큰 해시 등록, 주문 사진 비공개 저장소 및 RPC/Edge Function 반영, 개별 파일 공유 권한과 실사용 확인이 필요합니다.
- 운영 GitHub `admin.html` 및 운영 주문/재고/배송 DB는 이번 연결 작업에서 변경하지 않았습니다.

## 동작 구조
- 입력: 거래처가 A:H에 주문 입력 → 독립형 Apps Script → 테스트 Edge Function → 승인대기 → 관리자 승인
- 반영: 관리자 페이지에서 송장/5종 박스/사진 저장 → 승인 주문 ID로 조회한 서버 상태 → (설치된) Apps Script 5분 주기 → 거래처 시트 I:O 갱신
- 승인된 행은 `source_uid` 메타데이터를 검증하고 일치하지 않으면 덮어쓰지 않습니다.
- 부작용 차단: **구버전 Edge Function의 시트 I:N → DB 갱신 경로를 테스트 서버에서 제거**했습니다.
- Google Sheets에는 사진 파일이 아니라 개수만 표시. 실제 사진은 관리자 페이지 다운로드 .xlsx의 별도 `주문사진` 시트에 삽입됩니다.

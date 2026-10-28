# 거래처별 Google Sheets 주문 연동 v2 — 테스트용 개발 브랜치

> **운영 반영 전 검토용입니다.** `main`과 기존 운영 Supabase 주문 데이터는 변경하지 않습니다.

## 최종 요구사항
- 거래처마다 고유 Google Sheets 파일 1개 공유, 거래처에게는 해당 파일만 편집 권한 부여
- 거래처 작성 A~H: 주문일, 발송일, 상품명, 수량, 수령인, 연락처, 배송지, 요청사항
- 관리자 전용 I~N: 송장번호, 아이스박스 소·중·대, 종이박스 중·대
- 거래처 입력의 필수값이 완성되면 승인대기 자동 반영 (설치형 편집 트리거 + 5분 주기 보완)
- 거래처별 빈 양식 및 주문내역 .xlsx 다운로드, .xlsx 업로드 미리보기/검증/중복 건너뛰기
- 승인 전 업로드 수정은 해당 승인대기 항목에 반영, 승인 후 운영 주문 수정은 관리자만 처리
- 관리자가 상품행을 확인해 묶어서 승인한 경우에만 운영 DB에 '주문접수' 생성
- 출고정보는 정식 주문과 별도 저장, 다중 송장번호를 쉼표로 표시
- 어떤 단계에서도 운영 DB 주문·상품·재고 삭제/초기화 금지

## 파일
- `admin.html`: 별도 개발 브랜치에 추가된 '거래처 주문 승인' 및 '송장·포장박스' 화면
- `supabase/migrations/partner_sheet_v2_review.sql`: 신규 테이블·RLS·제한된 관리자 승인 RPC
- `supabase/functions/partner-sheet-ingest/index.ts`: 관리자 소유 자동 연동 API, 아직 미배포
- `apps_script/partner_sheet_sync.gs`: **독립형 관리자 전용** Apps Script. 서비스 토큰은 스크립트 속성에만 보관
- `apps_script/partner_sheet_menu.gs`, `apps_script/partner_sheet_excel.html`: **거래처 파일에 바인딩하는** 메뉴/엑셀 기능. 비밀 토큰 없음
- 거래처 시트 템플릿: https://docs.google.com/spreadsheets/d/1pl9SbXQVOZu2iuNrzG30gkjYlsnGH1Rm1vBd8eF85bw/edit

## 활성화 전 순서 (아직 진행하지 않음)
1. 테스트 Supabase 프로젝트 `bgswafqssdmktnmyyqef` 활성 상태 확인. 2026-10-28 복구 완료(ACTIVE_HEALTHY). 기초 DB 검증 완료
2. 테스트 DB에서 검토용 SQL 적용 후 테이블·RLS·관리자 승인/재승인/반려/송장 업데이트 트랜잭션 검증
3. 테스트 Edge Function `partner-sheet-ingest` 배포. 인증은 백엔드 서비스 키 + 거래처별 암호화 토큰 해시로 제한
4. 거래처 템플릿을 복사하여 독립 시트 파일 생성(고객 PII 없이). 테스트 거래처 계정만 편집자로 공유
5. 거래처 시트 파일 ID를 `public.partner_sheet_sources`에 등록하고 관리자 보유 **무작위 40자 이상** 토큰의 SHA-256 해시만 `private.partner_sheet_tokens`에 등록
6. 별도 **관리자 계정의 독립형 Apps Script**에 `partner_sheet_sync.gs` 설치. 스크립트 속성 `EDGE_URL`과 `SHEETS_CONFIG` 설정. 시트 소유자 계정으로 `installPartnerSheetTriggers` 실행
7. **거래처 시트에는** 보안 토큰 없이 `partner_sheet_menu.gs`와 `partner_sheet_excel.html`만 설치
8. 수기 입력·미완성 행·엑셀 업로드·수정·중복·반려·한 주문의 다품목 묶음·승인 후 수정 시도·5종 박스·쉼표 송장번호 테스트
9. 정상 검증 후 운영 DB에 **추가형 마이그레이션만** 적용하고, `main`으로 관리자 웹페이지 병합·배포
10. 실제 거래처별 공유 권한을 설정하고 계정마다 분리 동작 확인

## 보안 및 주의
- Supabase `service_role`·Google Sheets 자동동기화 토큰을 공개 GitHub 저장소나 거래처 공유 시트에 넣지 않습니다.
- 거래처 공유 시트에 관리용 Apps Script를 바인딩하지 않습니다. 독립형 관리자용 스크립트에서만 API 토큰 사용
- 보호된 I~N열은 관리자가 편집. 서버는 관리자 승인·출고 정보만 허용하는 별도 RPC 사용
- Google Sheets 기본 '가져오기'로 원본 덮어쓰기 금지. 맞춤 메뉴에서 새 행 추가 후 검증
- 입력값 완성 시 승인 대기되지만 출고·재고에는 **관리자 승인 전 반영하지 않음**
- 한 주문에 여러 상품 행이 있으면 관리자가 같은 배송정보를 검토하고 명시적으로 묶어 승인함
- 14개 표시열 이외의 식별자는 행의 개발자 메타데이터(`source_uid`)로 관리. 표시 열에 주문번호를 늘리지 않음
- 시트 편집이 실패하거나 엑셀 가져오기가 트리거를 실행하지 못해도 5분 주기 재확인. 5분은 예정 검사 간격이지 실시간 보장이 아님
- **현재 실제 연동은 비활성**이며 Google Sheet가 운영 DB에 자동으로 연결됐다고 안내하면 안 됨

## 테스트 체크리스트
- [ ] 거래처 A가 거래처 B 파일을 열람하지 못함
- [ ] A~H 필수항목 완성 시 동일 항목은 승인대기 1개만 생성
- [ ] 같은 파일 재업로드시 중복 정식주문 발생하지 않음
- [ ] 두 상품 행을 승인 1건으로 묶을 때 주문 1건 + 상품 2행 생성
- [ ] 다른 거래처/다른 배송정보를 한 주문으로 승인 불가
- [ ] 승인된 행 수정 시 운영 주문·기존 주문상품이 자동 변경되지 않음
- [ ] 출고완료 주문 취소 제한과 재고 거래이력 기존 방식 보존
- [ ] 송장번호 N개와 박스 5종 값 보존, 재동기화 때 중복 생성 없음
- [ ] 새 시트가 없거나 인증키가 틀리면 기존 운영 주문 데이터 영향 없음
- [ ] Google Sheets·Apps Script 모바일 호환성 별도 확인

## 2026-10-28 테스트 진행 결과 (테스트 프로젝트 한정)
- [x] `bgswafqssdmktnmyyqef` 복구 — `ACTIVE_HEALTHY` 확인
- [x] 중복·손상된 SQL 정리: 75,770자 → 15,453자, 6개 RPC 검사
- [x] `partner_sheet_v2_review_fixed_20261028` 테스트 마이그레이션 적용 성공
- [x] 신규 테이블 4개 및 RLS, 익명 조회·RPC 실행 차단 권한 확인
- [x] `partner-sheet-ingest` Edge Function 테스트 프로젝트에 배포(ACTIVE), 사용자 토큰 방식이라 JWT 검증 비활성화하되 함수 내 비밀 토큰 검증 적용
- [x] 테스트 DB에 운영 `create_admin_order_v2` 함수 정의만 복제(주문 데이터 미복제)
- [x] 순수 SQL 테스트: 최초 접수, 동일 UID 재전송, 승인 대기 변경, 승인 후 변경 차단, 잘못된 토큰 거부
- [x] 순수 SQL 테스트: 두 상품 행을 하나의 주문으로 승인, 재승인 차단, 5종 박스/쉼표 송장번호 저장 및 갱신, 거래처별 상태 조회
- [x] 테스트용 DML은 `BEGIN ... ROLLBACK` 실행으로 취소; 운영 DB에 대한 DML/DDL 없음
- [ ] 실사용 Google Sheets → Apps Script 트리거 → Edge Function HTTP → 테스트 DB 종단 간 테스트 (아직 미설치)
- [ ] 고객별 실제 공유 권한 점검, 관리자 I~N 보호 및 엑셀 UI 실제 검증
- [ ] 운영 배포 / `main` 병합 (미실시)

**주의:** DB/RPC SQL 단위 검증은 완료되었으나 Google Apps Script 직접 연동, 트리거 실행 권한, 실제 웹 관리자 로그인과 브라우저 상의 주문 승인은 아직 검증하지 않았습니다. 거래처용 템플릿은 공유 전 상태로 유지합니다. 거래처 파일에 관리자 동기화 토큰을 넣지 마세요.

### Google Sheets 연결 준비 단계
- 검증용 비공유 파일 생성: https://docs.google.com/spreadsheets/d/1cvd7XNsGMUfdMWudbqD4LFsBwIh6sTIdn8PWe_k4QNM/edit
- 원본 14열 템플릿과 별도 파일 ID 확인, 3개 탭 및 상품 드롭다운 확인
- Google Drive 공유 상태: `shared=false`, 파일 소유자 외 편집자 없음
- 테스트 DB `public.partner_sheet_sources`에 파일 ID 등록, `enabled=false`로 안전하게 비활성화 유지
- 원본 템플릿 및 운영 Google Sheets 변경 없음
- 별도 인증 토큰 생성/등록, Google Apps Script 관리자 소유 설치·권한 승인, 실제 편집 동기화 테스트는 아직 하지 않음

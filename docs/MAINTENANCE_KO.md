# 필요한 부분만 읽는 유지관리 안내

## 파일 지도
| 요청 | 먼저 볼 파일 |
| --- | --- |
| 화면 배치·버튼·스크립트 순서 | admin.html |
| 색·크기·모바일 화면 | styles/admin.css |
| 로그인·데이터 조회·메뉴·필터 | scripts/admin/core.js |
| 주문 입력·수정·목록·캘린더 거래명세 | scripts/admin/orders.js |
| 사진 추가·삭제·대기열 | scripts/admin/photos.js |
| 출고·취소·고객 승인·상품·기존 재고 | scripts/admin/catalog.js |
| 캘린더·월 준비·설정·모달 | scripts/admin/planning.js |
| ML 시트 주문 승인·취소·삭제·상품 매칭 | scripts/admin/partners.js |
| ML 승인 주문 수정 | scripts/admin/partner_edit.js |
| 송장·박스·사진 포함 Excel | scripts/admin/shipping.js |
| 뒤로가기·시작 시점 | scripts/admin/navigation.js, start.js |
| 인쇄용 키트 재료량 | scripts/order_materials.js |
| 거래명세·납품서 금액/인쇄 | scripts/order_documents.js |
| 새 원재료·반제품·제품 재고/생산 | scripts/material_inventory_ui.js, inventory_planner.js |
| 재고 엑셀 | scripts/inventory_excel.js |
| 주문 일괄 등록 | scripts/admin_order_import*.js |
| 고객 신청 | customer.html |
| ML 포털 본문·시트 동기화 | apps_script/ |
| API 권한·DB RPC | supabase/, docs/sql/ |

## 혼동하면 안 되는 기준
상품 가격은 DB의 products가 기준입니다. 인쇄용 재료표는 order_materials.js의 별도 목록이므로 상품관리 수정만으로 바뀌지 않습니다.
기존 출고 재고와 새 stock2 생산재고는 별개이며 생산계획만 저장해도 재고가 줄어드는 구조가 아닙니다.
일반 과자집의 잼 15g은 크리스마스 별도 상품 추가 요청 때문에 유지된 값입니다. 기억만으로 40g으로 바꾸지 않습니다.
현재 인쇄 목록에는 크리스마스 과자집이 없습니다. 실제 별도 상품명·구성 확인 후 등록해야 하며 추측해 일반 과자집 배합을 상속하지 않습니다.

## 코드 정리 범위
2026-11-21: 관리자 HTML에서 CSS와 기능 코드를 분리했습니다. 기존 전역 함수 호출 방식은 유지합니다.
과거 검증용 관리자 전체 복제본 2개는 최신 화면 연결문만 남겼습니다. 테스트 폴더의 독립 fixture, Apps Script 패치 도구와 SQL 이력은 사용처가 있어 유지합니다.
시작 파일을 마지막에 배치하고 인증 콜백도 그곳에 모았습니다. 다른 기능 파일을 불러오기 전에 인증 응답이 도착하는 문제를 방지합니다.
이전 preview 생성기는 로컬 스크립트를 복사하지 않았습니다. 이제 CSS/JS를 한 파일에 포함하고 테스트 프로젝트 연결로 치환합니다.

## 변경 절차
1. main 최신 커밋을 확인하고 작업 브랜치를 생성합니다.
2. 관련 파일과 대응 테스트만 읽고 최소 변경합니다.
3. npm run check, npm test 및 preview 생성을 실행합니다.
4. PR의 CI가 통과하면 병합합니다. 배포 완료와 운영 URL 응답을 별도로 확인합니다.
5. DB나 Apps Script 변경은 HTML 배포만으로 반영되지 않습니다. 필요한 경우 별도 배포 상태를 확인합니다.

## 복구
GitHub의 해당 PR에서 Revert하여 이전 코드로 되돌립니다. 운영 DB를 과거 SQL로 일괄 덮어쓰지 않습니다.
이번 정리 직전 기준 커밋: 45542c7. 주문·사진·재고 데이터 변경은 이번 정리에 포함하지 않습니다.
브라우저에 오래된 파일이 남으면 새로고침하고, 로컬 파일 오류는 npm run check로 먼저 확인합니다.

## AI 요청 예시
“AGENTS.md와 파일 지도를 먼저 읽고 [증상]을 수정해줘. 재현은 [화면/순서], 기대 결과는 [결과]. 관련 테스트와 전체 검사 후 변경·검증·미확인을 구분해서 보고해줘.”

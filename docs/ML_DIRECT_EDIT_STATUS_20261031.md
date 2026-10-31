# ML 승인 주문 직접 수정·삭제

사용자 확정: 승인 취소 없이 관리자와 ML 거래처 모두 수정·삭제 가능. 수정은 동일 주문 ID/승인 상태를 유지한다. 삭제는 관리자 주문 상품에 즉시 반영하고 UID 삭제키로 자동 재생성을 막는다. 마지막 상품 삭제 시 주문은 삭제 표시와 취소 이력으로 보존하고 일반 목록에서는 제외한다. 출고완료는 보호한다.

## 구현

- `docs/sql/ml_approved_direct_edit.sql`: 기존 상품과 ML 행의 안정적 연결, 관리자/거래처 직접 수정 RPC, 관리자 주문 수정의 ML 반영 트리거, 직접 삭제, 서버 상태의 원본 필드 응답.
- 관리자 ML 승인 목록에 수정·삭제. 주문번호·승인 상태 유지, 배송 공통정보는 같은 주문의 모든 상품에 반영.
- 포털은 승인 상태에서도 수정 폼 진입/저장, 삭제 버튼. 기존 사진/엑셀 코드는 `scripts/update_ml_direct_edit.cjs`로 원본 보존 업그레이드.
- 승인된 시트 행은 관리 서버의 정식 주문 정보로 반영. 기존 UID 보존, 다른 거래처 응답에는 원본 필드를 추가하지 않는다.

## 검증 및 적용 상태

테스트 Supabase `bgswafqssdmktnmyyqef`에 SQL과 partner-portal-manage v2 적용. SQL 롤백 회귀 검증 통과: 승인 유지 직접 수정, 관리자 수정 반영, 동일 주문번호/ID, 오래된 요청·잘못된 토큰 거부, 출고완료 보호, 상품 한 행/마지막 행 삭제, 재생성 차단, 재고/송장 불변. Node 테스트 10건 및 관리자 JavaScript 구문 검증 통과.

운영 Supabase, main, 운영 Google 소스/배포는 변경하지 않았다.

## 배포 차단

기존 ML 편집기 `https://script.google.com/home/projects/1Hrq4ekWBAgh59R4sKLYKeNCeAeGezOUwXfnB2UngXJjSC0Oq8MVVJF0T/edit`를 여는 동작에 브라우저 자동 승인 검토가 developers.google.com 원본 관찰 권한이 없다고 거절했다. 사용자의 수동 거절이 아니다. 우회하거나 재시도하지 않았다.

계속할 때 Google Apps Script 편집기 및 이 과정에서 필요한 공식 Google developers.google.com 접근에 대한 승인 후, 최신 운영 Code.gs를 UI로 다시 읽고 보관한다. `node scripts/update_ml_direct_edit.cjs original.gs patched.gs`로 변환하고 별도 테스트 Google 앱에서 실제 승인 상태 수정/삭제 및 사진/엑셀 회귀를 검증한다. 관리자 동기화 원본의 설정·트리거는 보존하며 새 mirrorMLApproved_ 포함 동기화 코드를 설치한다. 검증 후 운영 SQL/Edge, ML 기존 배포 URL을 유지한 새 버전, 관리자 main을 함께 반영한다.

완료 전 실제 운영 주문을 시험 목적으로 삭제하지 않는다. 기존 운영 반영 승인과 요구사항은 유효하며 다시 요구하지 않는다. 이번에 필요한 것은 자동 검토가 차단한 공식 Google 도메인 접근 승인이다.

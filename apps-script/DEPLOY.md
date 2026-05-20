# Apps Script 배포 런북 (변경이력 기능 도입)

CJM·KPI 두 Apps Script에 **변경이력 탭 + onEdit 자동 로깅 + applyChanges 일괄 반영 API** 를 추가하는 작업.

## 한 번만 하는 사전 작업

각 스크립트 모두에 대해 동일한 절차를 반복합니다.

### A. CJM 스크립트 배포

1. **시트 열기** → 확장 프로그램 → Apps Script (CJM 스크립트 프로젝트로 들어가기)
2. `Code.gs` (또는 메인 파일) 전체 내용을 모두 삭제
3. 로컬 저장소의 `apps-script/cjm.gs` 내용을 통째로 붙여넣기 → 저장 (Ctrl/Cmd + S)
4. **변경이력 탭 생성 (1회만)**
   - 왼쪽 함수 드롭다운에서 `initHistoryTab` 선택 → ▶ 실행
   - 처음이면 권한 동의 팝업 → 계정 선택 → "고급" → "안전하지 않음으로 이동" → 허용 (개인 스크립트라 정상)
   - 실행 후 로그(`Ctrl/Cmd + Enter`)에 `✅ 생성 완료: CJM_변경이력` 확인
   - 시트로 가서 `CJM_변경이력` 탭이 생겼는지 눈으로 확인
5. **테스트 로깅 (선택)**
   - `testLog` 함수 실행 → `CJM_변경이력` 시트 마지막 행에 테스트 행이 적히는지 확인
   - 확인 후 그 행은 삭제해도 됨
6. **새 버전 배포**
   - 우상단 [배포] → [배포 관리] → 기존 배포의 연필 아이콘
   - 버전: **새 버전** 선택
   - 설명: `v3: 변경이력 + onEdit + applyChanges` 같은 메모
   - [배포] 클릭
   - **엔드포인트 URL이 그대로인지 확인** (바뀌면 HTML도 같이 갱신해야 함)
7. **onEdit 트리거**
   - `onEdit` 이라는 이름의 함수는 **자동 트리거**로 동작 (별도 등록 불필요)
   - 시트의 `고객여정 Manager` 탭에서 아무 셀이나 수정 → `CJM_변경이력` 탭에 1줄 적히면 정상

### B. KPI 스크립트 배포

1. 같은 시트 → 확장 프로그램 → Apps Script → KPI 스크립트 프로젝트로 전환
   - 만약 둘이 같은 프로젝트에 들어가 있다면 통합 필요. 별도 프로젝트라면 그쪽으로 진입
2. 전체 코드 삭제 → `apps-script/kpi.gs` 내용 붙여넣기 → 저장
3. `initKpiHistoryTab` 실행 → `KPI_변경이력` 탭 생성 확인
4. **새 버전 배포** (CJM과 동일 절차)
5. **검증**
   - `여정별 KPI Manager` 탭에서 셀 1개 수정 → `KPI_변경이력`에 1줄
   - 대시보드에서 동기화(sync) 실행 → `KPI_변경이력`에 diff만큼 행 자동 적힘

## 자주 발생하는 문제

### "CJM_변경이력 탭이 없습니다" 오류
→ `initHistoryTab()` 미실행. Apps Script 편집기에서 한 번 실행.

### onEdit이 동작 안 함
- 같은 시트에 CJM/KPI 두 스크립트가 모두 `onEdit` 함수를 가지면, **각 스크립트의 onEdit는 자기 탭만 본다** (코드에 `getName() !== TAB` 가드 있음) → 충돌 X
- 그래도 안 되면 [트리거] 메뉴(시계 아이콘)에서 onEdit 트리거를 명시적으로 추가

### 변경자가 이메일로 찍힘
- onEdit은 자유 텍스트 입력이 불가능 → 자동으로 편집자 이메일 캡처
- 사용자 이름으로 바꾸려면 `CJM_변경이력` 시트의 해당 행 B열을 직접 수정
- `applyChanges` API는 호출 시 `editor: "홍길동"` 같이 자유 텍스트 전달 가능

## applyChanges API 호출 예시

51건 일괄 반영을 코드로 진행할 때:

```bash
curl -L -X POST \
  -H 'Content-Type: application/json' \
  -d @batch_payload.json \
  'https://script.google.com/macros/s/AKfycbwY-ZSmquMDmWaY39m_-CeTauo5ZXKrkyt8taQCsc-32bFj0YG_AjUEgwKz7mF01D2nEg/exec'
```

`batch_payload.json` 예:
```json
{
  "action": "applyChanges",
  "editor": "관리자명",
  "changes": [
    {
      "op": "addRow",
      "row": ["", "", "", "", "", "ent_app_auth_03", "신용카드 인증", "ALL"],
      "log": {
        "type": "추가", "level": "L4",
        "l1": "인입",
        "l2Code": "ent_app", "l2Name": "(T4S) 공식 앱/사이트 인입",
        "l3Code": "ent_app_auth", "l3Name": "본인인증",
        "l4Code": "ent_app_auth_03", "l4Name": "신용카드 인증",
        "field": "", "oldValue": "",
        "newValue": "ent_app_auth_03 | 신용카드 인증",
        "reason": "REQ_003"
      }
    },
    {
      "op": "updateCellByCode",
      "findField": "l4Code",
      "findCode": "use_benefit_card_01",
      "updateField": "l4Name",
      "newValue": "매직바코드 사용 (우주패스 포함)",
      "log": {
        "type": "수정", "level": "L4",
        "l1": "서비스 이용",
        "l2Code": "use_benefit", "l2Name": "혜택 이용 및 관리 (멤버십)",
        "l3Code": "use_benefit_card", "l3Name": "멤버십 바코드 사용",
        "l4Code": "use_benefit_card_01", "l4Name": "바코드 사용",
        "field": "l4Name",
        "oldValue": "바코드 사용",
        "newValue": "매직바코드 사용 (우주패스 포함)",
        "reason": "REQ_029"
      }
    }
  ]
}
```

응답:
```json
{
  "success": true,
  "applied": 2,
  "failed": 0,
  "results": [{"idx": 0, "ok": true, "reason": "REQ_003"}, ...]
}
```

## 51건 일괄 반영 시 권장 순서

1. 본 변경이력 인프라 배포 (위 절차)
2. 회신 필요 항목(REQ_017, 025, 026, 028, 053) 답변 회수
3. 구조 결정 (ISSUE-A `ord_acc` 분할 여부 등)
4. 결정 사항 반영한 `batch_payload.json` 생성 (Claude Code가 reviews/review_decisions_2026-05-20.csv를 보고 자동 변환)
5. applyChanges 호출
6. `CJM_변경이력` 탭에서 51줄 모두 정상 기록 확인
7. 검토_요청 탭의 해당 행 상태를 "처리완료"로 변경

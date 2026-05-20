# SKT 고객여정(CJM) Manager 2026

SKT 고객여정(CJM)과 여정별 KPI를 관리하는 두 개의 정적 대시보드. 한 개의 Google Sheet를 데이터 백엔드로 두고, Google Apps Script(GAS)로 읽기/쓰기, Vercel로 호스팅한다.

## 저장소
- GitHub: `Mjay-beep/cjm-journey-manager-2026`
- 로컬 경로: `/Users/1113869/claude-projects/cjm-journey-manager-2026/`

## 폴더 구조
```
cjm/                       CJM 대시보드 (Vercel 프로젝트 1)
  skt_cjm_dashboard_v3.html
  vercel.json              (/ → skt_cjm_dashboard_v3.html 리라이트)
kpi/                       KPI 대시보드 (Vercel 프로젝트 2)
  skt_kpi_dashboard.html
  vercel.json
  kpi_vercel.json
apps-script/               Google Apps Script 코드 (시트에 붙여넣는 원본 보관)
  cjm.gs                   CJM 백엔드 (doGet: 여정/대기요청, doPost: 검토요청 접수)
  kpi.gs                   KPI 백엔드 (doGet: KPI 목록, doPost: sync)
knowledge/                 참고 자료 (xlsx, pdf — 현장 개선 요청, 트래픽, 리서치 보고서)
```

## 데이터 백엔드 (Google Sheet)
- 시트 ID: `1sD604FpRUbi8mkT00DJxK3ErujIyhaxYzL302nuD7_A`
- URL: https://docs.google.com/spreadsheets/d/1sD604FpRUbi8mkT00DJxK3ErujIyhaxYzL302nuD7_A/edit
- 같은 시트 안에 **두 개의 독립된 Apps Script 프로젝트**가 붙어 있다 (CJM용 / KPI용).
- 주요 탭:
  - `고객여정 Manager` — CJM 4단계 계층(L1~L4), H열 `channels`
  - `검토_요청` — CJM 변경요청 큐 (대기/처리)
  - `여정별 KPI Manager` — KPI 10열 (I=삭제여부, J=삭제한 사람, Soft Delete)

## GAS 웹 엔드포인트
- CJM: `https://script.google.com/macros/s/AKfycbwY-ZSmquMDmWaY39m_-CeTauo5ZXKrkyt8taQCsc-32bFj0YG_AjUEgwKz7mF01D2nEg/exec`
- KPI: `https://script.google.com/macros/s/AKfycbwckTK8mJb1nf3ZZ1rPG7114DJJzgu0T93wdQi4S6LpvHf3MqqIlnxxa7zuk7b33RJyVA/exec`

각 HTML 안에 `const API = '...'` 로 박혀 있다.

## 배포 URL
- CJM: https://cjm-journey-manager-2026.vercel.app/
- KPI: https://skt-kpi-dashboard.vercel.app/

## 작업 흐름

### A. HTML(대시보드) 수정 시 — 자동 commit·push
1. `cjm/skt_cjm_dashboard_v3.html` 또는 `kpi/skt_kpi_dashboard.html` 수정
2. Claude Code가 변경 직후 자동으로 commit·push (사용자 별도 지시 없이)
3. Vercel이 main 브랜치 푸시를 감지해 자동 재배포 → 위 URL에 반영

### B. Apps Script 수정 시 — 수동 반영 필요
1. `apps-script/cjm.gs` 또는 `apps-script/kpi.gs` 수정 후 commit·push (자동)
2. **사용자가 직접** Google Sheet → 확장프로그램 → Apps Script 편집기에서 해당 스크립트 열기
3. 전체 코드를 파일 내용으로 교체
4. [배포] → [배포 관리] → 연필 아이콘 → 버전: 새 버전 → [배포]
5. 엔드포인트 URL이 바뀌지 않는지 확인 (바뀌면 HTML의 `API` 상수도 갱신 필요)

`.gs` 파일은 단순 백업/버전 관리용. 실제 실행 코드는 Apps Script 편집기 안에 있다.

### C. knowledge/ 자료 추가
- 그냥 파일 추가 후 commit·push. 대시보드 코드에서 참조하지는 않음.

## 자동 commit·push 규칙
- 이 저장소(`cjm-journey-manager-2026`)에서 작업 시, 의미 있는 변경을 만들었으면 **별도 지시가 없어도** commit + push까지 진행한다.
- 커밋 메시지는 한국어로, 무엇을·왜를 1-2 문장으로 적는다.
- HTML/Apps Script 동시 수정처럼 논리적으로 한 단위인 변경은 한 커밋으로 묶는다.
- 단, 다음 경우엔 commit·push 전 사용자 확인:
  - 파일 삭제·대량 리네임
  - 시트 ID·GAS 엔드포인트·Vercel 설정처럼 외부 시스템과 연결된 식별자 변경

## 자주 쓰는 것
- 현재 대기 요청 확인: `curl '<CJM 엔드포인트>' | jq '.pendingReviews | length'`
- KPI 행 수 확인: `curl '<KPI 엔드포인트>' | jq '.count'`

## 사용자 컨텍스트
- 사용자는 UX/CX 담당자이며 비개발자. 변경 설명은 한국어, "어디서 무엇이 바뀌는지" 위주로.
- 진행 상황은 한 줄이라도 자주 알린다 (긴 침묵 X).

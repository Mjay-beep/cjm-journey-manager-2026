import html, re
ROOT='/Users/1113869/claude-projects/cjm-journey-manager-2026'
def esc(s): return html.escape(s, quote=False)
def ul(items): return '<ul>'+''.join(f'<li>{x}</li>' for x in items)+'</ul>'
def table(rows):
    t='<table><tbody><tr><th>번호</th><th>수정 내용</th></tr>'
    for n,c in rows: t+=f'<tr><td><strong>{esc(n)}</strong></td><td>{c}</td></tr>'
    return t+'</tbody></table>'
def img(f,w): return f'<ac:image ac:width="{w}"><ri:attachment ri:filename="{f}"/></ac:image>'
WIDE=1300; MOD=800
X=[]; MD=['# CJM 대시보드 검토','']
def fig(n,title,f,w,rows):
    X.append(f'<h3>그림 {n}. {esc(title)}</h3>'); X.append(img(f,w)); X.append(table(rows))
    MD.extend([f'### 그림 {n}. {title}','',f'![그림 {n}](cjm_review_images/{f})','','| 번호 | 수정 내용 |','|---|---|'])
    for a,b in rows: MD.append(f'| {a} | {re.sub("<[^>]+>"," ",b).strip()} |')
    MD.append('')

X.append('<h2>공통</h2>')
common=[('공통 1', ul(['전반적으로 UI수정 필요. 아이콘 깨짐, 폰트 크기 제각각, 버튼 크기 제각각 등 전체적으로 일관된 UI적용 필요.','폰트 전체적으로 Pretendard 적용'])),
        ('공통 2','사용자 화면이 보는 버전은 확정 버전이도록 개발 필요')]
X.append(table(common))
MD+=['## 공통','','| 번호 | 수정 내용 |','|---|---|']+[f'| {a} | {re.sub("<[^>]+>"," ",b).strip()} |' for a,b in common]+['']

X.append('<h2>사용자 화면</h2>'); MD+=['## 사용자 화면','']
fig(1,'사용자 헤더와 필터 바','U01_header.png',WIDE,[
 ('1','검토 대기가 필요할지 확인 필요'),
 ('2',"필터 '전체 선택' 버튼으로 할 것 시, 선택 시, 각 항목이 모두 check되고, '전체 선택'은 '전체 해제'로 변경"),
 ('3','문자 기호(아이콘(↗ ⌕ ▣ ⚙ ↑ ↘), 헤더(▧), 행 액션(＋ ✎)) 모두 아이콘으로 변경'),
 ('4','서비스명 "SK텔레콤 고객 여정 지도"'),
 ('5','"NCSTUDIO · NEXT CS", "Customer Journey Map — L1~L4 · 승인 원장" 제거'),
])
fig(2,'사용자 여정 지도, 전체 펼침 상태','U02_map.png',WIDE,[
 ('6','채번 검토 필요. 구글 시트 원장 코드 방식을 따를 것. 현재는 코드를 제멋대로 생성한 방식임'),
 ('7','해당 내용 제거'),
 ('8','현재 검토대기 요청이 있는 행은 연필이 파란 테두리로 바뀌고, 클릭 시 새 요청 대신 기존 요청 상세가 열림. 그래서 새 요청을 할 수 없는 상태.<br/>행에 "검토대기" 배지 별도 표시하고, 수정 버튼 탭은 새 요청을 더 할 수 있도록 개선'),
 ('9','L2 등록 요청만 하단에 있는 것이 이상함. L3, L4도 리스트를 추가하는 것 처럼 보여줄 것. 기존 대시보드 참고'),
 ('10','여정 카드 내부 10px, 11px, 12px 혼용 → 일원'),
 ('11','문구 수정<br/>L1 카드를 펼쳐 L2~L4 고객 접점을 확인하세요. 사용자 요청은 승인 전 원장에 반영되지 않습니다.<br/>→ L1 여정을 펼쳐 L2~L4 여정을 확인할 수 있어요. 사용자 요청 사항은 관리자 승인후 반영됩니다.'),
])
fig(3,'L4 등록 요청 모달, 빈 값으로 제출한 직후','U03_l4_register.png',MOD,[
 ('12','채널 복수 선택(체크박스 또는 멀티 셀렉트)으로 변경'),
 ('13','인풋 필드 미입력에 대한 오류는, 해당 인풋필드 하단에 표시'),
 ('14','사용자 화면 코드 입력란은 "관리자가 부여" 로 안내'),
])
fig(4,'L4 수정 요청 모달','U04_l4_edit.png',MOD,[
 ('15','드롭다운이 아니라, 모달 상단에 수정/삭제 선택 라디오 버튼으로 제공'),
])
fig(5,'내 요청 상세','U05_myreq_detail.png',MOD,[
 ('16', ul(['요청 당시 값과 현재 원장 값은 중복 내용','원장이라는 말보다는 데이터로 변경'+ul(['현재 데이터','요청 데이터','현재 원장 값 → 현재 데이터','최종 반영 값 → 최종 반영 데이터'])])),
])
fig(6,'"결제" 검색 결과','U07_search.png',WIDE,[
 ('17','검색창 글씨가 흰색으로 나옴. 보이지 않음'),
 ('18','검색 결과 표시시에는 펼쳐서 보여줄 것. 현재는 접혀있는 상태에서 L4에 용어가 검색되도, 계속 접혀있음'),
])
X.append('<h2>관리자 화면</h2>'); MD+=['## 관리자 화면','']
fig(7,'관리자 메인','A01_admin_main.png',WIDE,[
 ('19','관리자 화면에도 "내 요청 1" 버튼 존재. "내 요청" 제거 또는 "요청 관리" 로 통합<br/>\'검토대기 4건, 관리자 저장은 즉시반영\'은 삭제'),
])
fig(8,'요청·변경 이력 탭','A04_history.png',WIDE,[
 ('20','상태를 별도 열로 분리'),
])
fig(9,'버전 확정 모달','A05_version_confirm.png',MOD,[
 ('21','현재 편집 중 원장을 스냅샷으로 보존합니다. → 현재 편집 중인 버전을 배포 버전으로 확정합니다.'),
 ('22','"직전 버전 대비 9건 변경" 표시는 있으나 내역 보기 링크 없음. 변경 내역 볼 수 있게 해줄 것'),
])
storage='\n'.join(X)
open(f'{ROOT}/knowledge/cjm_review_images/page.storage.xhtml','w',encoding='utf-8').write(storage)
open(f'{ROOT}/knowledge/cjm_dashboard_review_2026-09-30.md','w',encoding='utf-8').write('\n'.join(MD))
print('ok', storage.count('<ac:image'), storage.count('<table>'))

import re, html, subprocess
ROOT='/Users/1113869/claude-projects/cjm-journey-manager-2026'
src = subprocess.run(['git','show','HEAD~1:knowledge/cjm_dashboard_review_2026-09-30.md'],cwd=ROOT,capture_output=True,text=True).stdout

# --- parse source tables / lists ---
items={}   # num -> dict(위치, 현상, 문제, 제안)
section_lists={}
cur=None
for line in src.split('\n'):
    if line.startswith('## '): cur=line[3:].strip(); section_lists[cur]=[]; continue
    m=re.match(r'^\| (\d-\d+) \| (.*) \|$', line)
    if m:
        cells=[c.strip() for c in m.group(2).split(' | ')]
        if len(cells)==4: items[m.group(1)]=dict(위치=cells[0],현상=cells[1],문제=cells[2],제안=cells[3])
        else: items[m.group(1)]=dict(위치=cells[0],현상=cells[1],문제='',제안=cells[2])
        continue
    if line.startswith('- ') and cur: section_lists[cur].append(line[2:])
assert len(items)==32, len(items)

FIG = [
 (1,'U01_header.png','사용자 헤더와 필터 바',['2-4','2-12','4-1','4-4','4-5'],['2-1']),
 (2,'U02_map.png','사용자 여정 지도, 전체 펼침 상태',['1-2','1-3','2-5','2-9','2-11','4-2'],['4-1']),
 (3,'U03_l4_register.png','L4 등록 요청 모달, 빈 값으로 제출한 직후',['1-1','2-7','4-6'],[]),
 (4,'U04_l4_edit.png','L4 수정 요청 모달',['2-6'],['1-1']),
 (5,'U05_myreq_detail.png','내 요청 상세',['2-8'],[]),
 (6,'U06_l1_filter.png','L1 필터로 인입만 선택한 상태',['2-2'],[]),
 (7,'U07_search.png','"결제" 검색 결과',['2-3'],[]),
 (8,'U08_channel.png','채널 필터에서 T월드를 한 번 클릭한 상태',['2-1'],[]),
 (9,'U09_1024.png','1024px 폭에서 본 사용자 화면',['4-3'],['1-2']),
 (10,'A01_admin_main.png','관리자 메인',['3-1','3-6','4-7'],['3-9']),
 (11,'A02_approve.png','관리자 승인 처리 모달',['3-2','3-3'],['3-4']),
 (12,'A03_edit.png','관리자 L2 직접 수정 모달',['3-4','3-5'],[]),
 (13,'A04_history.png','요청·변경 이력 탭',['3-7','3-8'],[]),
 (14,'A05_version_confirm.png','버전 확정 모달',['3-9'],[]),
 (15,'A06_v11.png','확정 버전(v1.1) 조회 화면',['3-10'],[]),
]
PRIMARY={}
for n,f,t,p,s in FIG:
    for k in p: PRIMARY[k]=n
WIDE={1,2,6,7,8,9,10,13}
covered=set(PRIMARY); missing=[k for k in items if k not in covered]
assert missing==['2-10'], missing
PRIO={'1-1','1-2','1-3'}

def esc(s): return re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', html.escape(s, quote=False))
def table(header, rows):
    t='<table><tbody><tr>'+''.join(f'<th>{esc(c)}</th>' for c in header)+'</tr>'
    for r in rows: t+='<tr>'+''.join(f'<td>{c}</td>' for c in r)+'</tr>'
    return t+'</tbody></table>'
def img(n,f): return f'<ac:image ac:width="{1300 if n in WIDE else 800}"><ri:attachment ri:filename="{f}"/></ac:image>'
def numcell(k): return f'<strong>{k}</strong>'+(' 최우선' if k in PRIO else '')
def item_rows(nums):
    rows=[]
    for k in nums:
        it=items[k]; rows.append([numcell(k), esc(it['위치']), esc(it['현상']), esc(it['문제']), esc(it['제안'])])
    return rows

X=[]; MD=['# CJM 대시보드 검토','']
H=['번호','위치','확인된 현상','문제','수정 제안']
# 개요
X.append('<h2>검토 개요</h2>')
ov=section_lists['검토 개요']
ov.append('읽는 방법: 그림마다 바로 아래 표에 그 그림에 표시된 번호만 정리. 번호 체계는 1 최우선 결정, 2 사용자 화면, 3 관리자 화면, 4 공통 UI와 문구')
X.append('<ul>'+''.join(f'<li>{esc(x)}</li>' for x in ov)+'</ul>')
MD+=['## 검토 개요','']+[f'- {x}' for x in ov]+['']
# 최우선
X.append('<h2>1. 개발 착수 전 결정 필요 3건</h2>')
X.append('<p>상세 현상과 제안은 각 그림 아래 표에 있음. 여기서는 요약만 기재</p>')
prio_rows=[]
MD+=['## 1. 개발 착수 전 결정 필요 3건','','| 번호 | 요약 | 그림 |','|---|---|---|']
summ={'1-1':'L4 채널이 단일 선택. 실제 원장은 복수 채널 129건, ALL 38건, ALL(Digital) 31건','1-2':'L1 6개 고정 6열 레이아웃. 실제 L1당 L4 88개 수준이라 열이 지나치게 길고 명칭 잘림','1-3':'코드 체계와 L1 명칭이 실제 원장과 다름. KPI 시트가 L4 코드로 연결되어 재발번 금지'}
for k in ['1-1','1-2','1-3']:
    figs=sorted({n for n,f,t,p,s in FIG if k in p or k in s})
    g=', '.join(f'그림 {n}' for n in figs)
    prio_rows.append([numcell(k), esc(summ[k]), g]); MD.append(f'| {k} | {summ[k]} | {g} |')
X.append(table(['번호','요약','그림'], prio_rows)); MD.append('')
# 그림별
def fig_block(n,f,t,p,s):
    X.append(f'<h3>그림 {n}. {esc(t)}</h3>')
    note=f'붉은 번호 {", ".join(p+s)} 표시'+ (f'. 이 중 {", ".join(s)}은 다른 그림 표에서 설명' if s else '')
    X.append(f'<p>{esc(note)}</p>')
    X.append(img(n,f))
    X.append(table(H, item_rows(p)))
    MD.extend([f'### 그림 {n}. {t}','',note,'',f'![그림 {n}](cjm_review_images/{f})','','| '+' | '.join(H)+' |','|---|---|---|---|---|'])
    for k in p:
        it=items[k]; MD.append(f'| {k}{" (최우선)" if k in PRIO else ""} | {it["위치"]} | {it["현상"]} | {it["문제"]} | {it["제안"]} |')
    MD.append('')
X.append('<h2>2. 사용자 화면</h2>'); MD+=['## 2. 사용자 화면','']
for fg in FIG[:9]: fig_block(*fg)
X.append('<h2>3. 관리자 화면</h2>'); MD+=['## 3. 관리자 화면','']
for fg in FIG[9:]: fig_block(*fg)
# 그림 없는 항목
X.append('<h2>4. 그림 없는 항목</h2>'); X.append(table(H, item_rows(['2-10'])))
it=items['2-10']; MD+=['## 4. 그림 없는 항목','','| '+' | '.join(H)+' |','|---|---|---|---|---|',f'| 2-10 | {it["위치"]} | {it["현상"]} | {it["문제"]} | {it["제안"]} |','']
# 확인 요청 / 유지
for sec,title in [('5. 개발자 확인 요청','5. 개발자 확인 요청'),('6. 유지할 점','6. 유지할 점')]:
    X.append(f'<h2>{title}</h2><ul>'+''.join(f'<li>{esc(x)}</li>' for x in section_lists[sec])+'</ul>')
    MD+=[f'## {title}','']+[f'- {x}' for x in section_lists[sec]]+['']
storage='\n'.join(X)
open(f'{ROOT}/knowledge/cjm_review_images/page.storage.xhtml','w',encoding='utf-8').write(storage)
open(f'{ROOT}/knowledge/cjm_dashboard_review_2026-09-30.md','w',encoding='utf-8').write('\n'.join(MD))
print('ok', len(storage), storage.count('<ac:image'), storage.count('<table>'))

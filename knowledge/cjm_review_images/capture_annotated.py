import json, os, subprocess, sys
from PIL import Image

S = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(S, "site")
OUT = os.path.join(S, "shots")
BIN = os.path.expanduser("~/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell")
os.makedirs(OUT, exist_ok=True)

RUNNER = r"""
<script>
(function(){
const SCENE = __SCENE__;
const wait = ms => new Promise(r=>setTimeout(r,ms));
function byText(tag,text,contains){ const m=[...document.querySelectorAll(tag||'*')].filter(e=>{const t=(e.innerText||e.textContent||'').trim(); return contains? t.includes(text) : t===text;}); return m.find(e=>!m.some(o=>o!==e&&e.contains(o))); }
function byAria(label,contains){ return [...document.querySelectorAll('[aria-label]')].find(e=>contains? e.getAttribute('aria-label').includes(label): e.getAttribute('aria-label')===label); }
function resolve(t){
  if(!t) return null;
  if(t.sel){ const all=[...document.querySelectorAll(t.sel)]; return t.last? all[all.length-1] : all[t.idx||0]; }
  if(t.aria) return byAria(t.aria, t.contains);
  if(t.text) return byText(t.tag, t.text, t.contains);
  return null;
}
function setInput(el, val){ const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(el,val); el.dispatchEvent(new Event('input',{bubbles:true})); }
async function runSteps(){
  for(const st of (SCENE.steps||[])){
    if(st.type!==undefined){ const el=resolve(st.target)||document.querySelector('input[type=text]'); setInput(el, st.type); }
    else if(st.scroll!==undefined){ window.scrollTo(0, st.scroll); }
    else { const el=resolve(st.target); if(!el){ console.warn('missing', JSON.stringify(st.target)); document.title='MISSING '+JSON.stringify(st.target); } else el.click(); }
    await wait(st.wait||600);
  }
}
function badge(n, x, y){
  const b=document.createElement('div');
  b.textContent=n;
  Object.assign(b.style,{position:'fixed',left:x+'px',top:y+'px',transform:'translate(-50%,-50%)',minWidth:'30px',height:'30px',padding:'0 7px',borderRadius:'15px',background:'#e5242c',color:'#fff',font:'700 13px/30px Pretendard, sans-serif',textAlign:'center',boxShadow:'0 0 0 2px #fff, 0 2px 6px rgba(0,0,0,.35)',zIndex:'2147483647',pointerEvents:'none',letterSpacing:'0'});
  document.body.appendChild(b);
}
function outline(r, pad){
  const o=document.createElement('div');
  Object.assign(o.style,{position:'fixed',left:(r.left-pad)+'px',top:(r.top-pad)+'px',width:(r.width+pad*2)+'px',height:(r.height+pad*2)+'px',border:'2px solid #e5242c',borderRadius:'6px',zIndex:'2147483646',pointerEvents:'none',boxSizing:'border-box'});
  document.body.appendChild(o);
}
function union(els){ let l=1e9,t=1e9,r=-1e9,b=-1e9; els.forEach(e=>{const q=e.getBoundingClientRect(); l=Math.min(l,q.left);t=Math.min(t,q.top);r=Math.max(r,q.right);b=Math.max(b,q.bottom);}); return {left:l,top:t,width:r-l,height:b-t,right:r,bottom:b}; }
function drawMarkers(){
  for(const m of (SCENE.markers||[])){
    let els=[];
    if(m.targets) els=m.targets.map(resolve).filter(Boolean);
    else { const e=resolve(m.target); if(e) els=[e]; }
    if(m.rect){ els=[]; }
    if(!els.length && !m.rect){ console.warn('marker missing', m.n); document.title='MISSING marker '+m.n; continue; }
    const r = m.rect ? {left:m.rect[0],top:m.rect[1],width:m.rect[2],height:m.rect[3],right:m.rect[0]+m.rect[2],bottom:m.rect[1]+m.rect[3]} : union(els);
    const pad = m.pad!==undefined? m.pad : 4;
    if(m.box!==false) outline(r, pad);
    const pos = m.pos||'tl';
    let x,y;
    if(pos==='tl'){x=r.left-pad;y=r.top-pad;}
    else if(pos==='tr'){x=r.right+pad;y=r.top-pad;}
    else if(pos==='bl'){x=r.left-pad;y=r.bottom+pad;}
    else if(pos==='br'){x=r.right+pad;y=r.bottom+pad;}
    else if(pos==='l'){x=r.left-pad-18;y=r.top+r.height/2;}
    else if(pos==='r'){x=r.right+pad+18;y=r.top+r.height/2;}
    else if(pos==='t'){x=r.left+r.width/2;y=r.top-pad-16;}
    else if(pos==='b'){x=r.left+r.width/2;y=r.bottom+pad+16;}
    if(m.dx) x+=m.dx; if(m.dy) y+=m.dy;
    badge(m.n, x, y);
  }
}
(async()=>{ await wait(SCENE.initWait||900); await runSteps(); await wait(300); drawMarkers(); document.title='READY'; })();
})();
</script>
"""

def build(scene):
    src = open(os.path.join(SITE, scene["file"]), encoding="utf-8").read()
    head, sep, tail = src.rpartition("</body>")
    html = head + RUNNER.replace("__SCENE__", json.dumps(scene, ensure_ascii=False)) + sep + tail
    p = os.path.join(OUT, scene["name"] + ".html")
    open(p, "w", encoding="utf-8").write(html)
    return p

def shoot(scene):
    p = build(scene)
    w, h = scene.get("size", (1440, 1000))
    out = os.path.join(OUT, scene["name"] + ".png")
    cmd = [BIN, "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
           f"--user-data-dir={S}/chrome-profile2", f"--window-size={w},{h}",
           "--force-device-scale-factor=2", f"--virtual-time-budget={scene.get('timeout', 6000)}",
           f"--screenshot={out}", "file://" + p]
    subprocess.run(cmd, capture_output=True, timeout=60)
    im = Image.open(out)
    if scene.get("crop"):
        x0, y0, x1, y1 = scene["crop"]
        im = im.crop((x0*2, y0*2, x1*2, y1*2))
        im.save(out)
    print(scene["name"], im.size)

U = "user-standalone.html"; A = "admin-standalone.html"
SCENES = [
 # ---------- 사용자 ----------
 dict(name="U01_header", file=U, size=(1440, 1000), crop=(0, 0, 1440, 275),
      markers=[
        dict(n="4-5", target=dict(text="NCSTUDIO · NEXT CS", tag="*"), pos="r", dx=8),
        dict(n="4-4", target=dict(text="고객 여정 Manager", tag="h1"), pos="r", dx=8),
        dict(n="4-4", target=dict(text="고객 여정 가이드", tag="h2"), pos="r", dx=8),
        dict(n="2-12", target=dict(text="Customer Journey Map — L1~L4 · 승인 원장", tag="*"), pos="r", dx=8),
        dict(n="4-1", target=dict(text="▧", tag="*"), pos="l", dx=-4),
        dict(n="2-1", targets=[dict(aria="T월드"), dict(text="AI", tag="*")], pos="tr", pad=6),
        dict(n="2-4", target=dict(text="검토대기", tag="button"), pos="l", pad=6),
      ]),
 dict(name="U02_map", file=U, size=(1440, 1560), crop=(0, 215, 1440, 1230),
      steps=[dict(target=dict(text="전체 펼치기", tag="button"))],
      markers=[
        dict(n="1-2", rect=[24, 288, 1392, 880], pos="tr", pad=0, dx=-30, dy=-8),
        dict(n="4-1", target=dict(text="⌕", tag="*"), pos="l", dx=-6),
        dict(n="1-3", target=dict(text="INB_1_1_1", tag="*"), pos="l"),
        dict(n="4-2", target=dict(text="INB_1_2_1", tag="*"), pos="l"),
        dict(n="2-9", target=dict(aria="L2 공식 앱·사이트 인입 수정 요청 검토대기 상세"), pos="r"),
        dict(n="2-11", target=dict(text="L2 등록 요청", tag="button"), pos="r"),
        dict(n="2-5", target=dict(text="검토대기 4건 · 관리자 저장은 즉시 반영", tag="*"), pos="l"),
      ]),
 dict(name="U03_l4_register", file=U, size=(1440, 1000),
      steps=[dict(target=dict(text="전체 펼치기", tag="button")), dict(target=dict(aria="L3 니즈 발생 진입·확인 L4 등록 요청")), dict(target=dict(text="요청 제출", tag="button"))],
      crop=(300, 60, 1140, 900),
      markers=[
        dict(n="1-1", target=dict(sel="[role=dialog] [role=combobox]"), pos="r"),
        dict(n="4-6", target=dict(sel="[role=dialog] input[disabled]"), pos="l"),
        dict(n="2-7", targets=[dict(text="명칭", tag="[role=dialog] label"), dict(text="의견/사유", tag="[role=dialog] label")], pos="r", box=False),
        dict(n="2-7", target=dict(sel="[role=dialog] [class*=message-info]"), pos="l"),
      ]),
 dict(name="U04_l4_edit", file=U, size=(1440, 1000),
      steps=[dict(target=dict(text="전체 펼치기", tag="button")), dict(target=dict(aria="L4 정보 확인 수정 요청"))],
      crop=(300, 30, 1140, 900),
      markers=[
        dict(n="2-6", target=dict(sel="[role=dialog] [role=combobox]", idx=0), pos="tl"),
        dict(n="1-1", target=dict(sel="[role=dialog] [role=combobox]", idx=1), pos="r"),
      ]),
 dict(name="U05_myreq_detail", file=U, size=(1440, 1000),
      steps=[dict(target=dict(aria="내 요청", contains=True)), dict(target=dict(sel="[role=dialog] table tbody tr"))],
      crop=(160, 200, 1280, 780),
      markers=[
        dict(n="2-8", targets=[dict(text="요청 당시 원장값", tag="*"), dict(text="최종 반영값", tag="*")], pos="tl", pad=8, dy=-4, dx=-2),
        dict(n="2-8", targets=[dict(text="미지정", tag="*", idx=0)], pos="l", box=False),
      ]),
 dict(name="U06_l1_filter", file=U, size=(1440, 1000),
      steps=[dict(target=dict(aria="L1 필터")), dict(target=dict(text="인입", tag="[role=option]"))],
      crop=(0, 150, 1440, 760),
      markers=[
        dict(n="2-2", target=dict(aria="L1 필터"), pos="r"),
        dict(n="2-2", rect=[290, 280, 1120, 400], pos="tl", pad=0, dx=-8),
      ]),
 dict(name="U07_search", file=U, size=(1440, 1000),
      steps=[dict(type="결제", wait=900)],
      crop=(0, 80, 1440, 560),
      markers=[
        dict(n="2-3", target=dict(sel="input[type=text]"), pos="l"),
        dict(n="2-3", target=dict(sel="article"), pos="r"),
      ]),
 dict(name="U08_channel", file=U, size=(1440, 1000),
      steps=[dict(target=dict(aria="T월드"))],
      crop=(0, 150, 1440, 560),
      markers=[
        dict(n="2-1", targets=[dict(aria="T월드"), dict(text="전체 해제", tag="button")], pos="tr", pad=6),
      ]),
 dict(name="U09_1024", file=U, size=(1024, 760),
      steps=[dict(target=dict(text="전체 펼치기", tag="button"))],
      markers=[
        dict(n="4-3", targets=[dict(text="채널 필터", tag="*"), dict(aria="AI")], pos="r", pad=6),
        dict(n="4-3", rect=[24, 90, 620, 90], pos="r"),
        dict(n="1-2", target=dict(sel="article", idx=4), pos="tl"),
      ]),
 # ---------- 관리자 ----------
 dict(name="A01_admin_main", file=A, size=(1440, 1000),
      markers=[
        dict(n="3-1", target=dict(aria="내 요청", contains=True), pos="l"),
        dict(n="3-1", target=dict(sel="[role=tab]", idx=1), pos="r"),
        dict(n="3-1", target=dict(text="검토대기 4건 · 관리자 저장은 즉시 반영", tag="*"), pos="l"),
        dict(n="4-7", target=dict(text="L1 카드를 펼쳐", tag="p", contains=True), pos="r"),
        dict(n="3-6", targets=[dict(text="+ L1 등록", tag="button")], pos="l"),
        dict(n="3-6", target=dict(sel="article", idx=1), pos="tl", box=True, dx=14, dy=14),
        dict(n="3-9", target=dict(text="버전 확정", tag="button"), pos="b"),
      ]),
 dict(name="A02_approve", file=A, size=(1440, 1000),
      steps=[dict(target=dict(aria="검토대기 상세", contains=True))],
      crop=(160, 120, 1280, 900),
      markers=[
        dict(n="3-3", targets=[dict(text="요청 당시 원장값", tag="*"), dict(text="최종 반영값", tag="*")], pos="tl", pad=8, dx=-2, dy=-4),
        dict(n="3-4", target=dict(sel="[role=dialog] input[type=text]", idx=0), pos="l"),
        dict(n="3-2", target=dict(text="승인·원장 반영", tag="button"), pos="l"),
      ]),
 dict(name="A03_edit", file=A, size=(1440, 1000),
      steps=[dict(target=dict(aria="L2 니즈 발생 수정"))],
      crop=(300, 60, 1140, 900),
      markers=[
        dict(n="3-5", target=dict(sel="[role=dialog] [role=combobox]", idx=0), pos="tl"),
        dict(n="3-4", target=dict(sel="[role=dialog] input[type=text]", idx=0), pos="l"),
      ]),
 dict(name="A04_history", file=A, size=(1440, 1000),
      steps=[dict(target=dict(sel="[role=tab]", idx=1), wait=900)],
      crop=(0, 150, 1440, 900),
      markers=[
        dict(n="3-7", targets=[dict(aria="검토 대상만"), dict(text="종료일", tag="*")], pos="l", pad=8, dx=-90),
        dict(n="3-8", target=dict(text="ID · 상태", tag="*", contains=True), pos="t"),
        dict(n="3-8", target=dict(sel="table tbody tr:nth-child(2) td:nth-child(2)"), pos="l"),
      ]),
 dict(name="A05_version_confirm", file=A, size=(1440, 1000),
      steps=[dict(target=dict(text="버전 확정", tag="button"))],
      crop=(300, 180, 1140, 780),
      markers=[
        dict(n="3-9", target=dict(sel="[role=dialog] input[type=text]", idx=0), pos="l"),
        dict(n="3-9", rect=[530, 521, 105, 24], pos="r"),
      ]),
 dict(name="A06_v11", file=A, size=(1440, 1000),
      steps=[dict(target=dict(aria="표시 버전")), dict(target=dict(text="v1.1", tag="[role=option]"), wait=900)],
      crop=(0, 150, 1440, 700),
      markers=[
        dict(n="3-10", target=dict(text="검토대기", tag="button"), pos="l"),
        dict(n="3-10", target=dict(text="확정된 버전의 원장 스냅샷입니다", tag="*", contains=True), pos="r", box=False),
      ]),
]

only = sys.argv[1:]
for sc in SCENES:
    if only and sc["name"] not in only: continue
    try:
        shoot(sc)
    except Exception as e:
        print("FAIL", sc["name"], e)

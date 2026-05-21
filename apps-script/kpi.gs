// ============================================================
// SKT 고객여정 KPI Dashboard — Google Apps Script (v8)
// ============================================================
// v7 대비 변경 (2026-05-21):
// - NUM_COLS 10 → 11로 확장: K열 "출처" 추가
//   (출처 종류: ① 현업 의견 ② NOVA SBF KPI ③ General KPI(AI작성) ④ 기존(박민재 임의))
// - COL_LABELS / COL 매핑에 SOURCE 추가
// - sync diff 비교에 SOURCE 포함
//
// v7 (2026-05-20):
// - KPI_변경이력 탭 도입 (append-only audit log)
// - onEdit 트리거: 시트 직접 편집 시 자동 로깅
// - sync 액션이 덮어쓰기 전에 diff 계산하여 변경이력에 자동 기록
// - doPost 새 액션: applyChanges (외부 호출로 일괄 반영 + 사유 포함)
// - initKpiHistoryTab(): 변경이력 탭 헤더 1회 생성용
//
// 시트 컬럼 (11열): A:L1, B:L2, C:KPI지표명, D:KPI설명, E:산식/정의,
//                 F:측정주기, G:수정한 사람, H:수정 내용, I:삭제여부, J:삭제한 사람, K:출처
//
// 연결된 웹 엔드포인트:
//   https://script.google.com/macros/s/AKfycbwckTK8mJb1nf3ZZ1rPG7114DJJzgu0T93wdQi4S6LpvHf3MqqIlnxxa7zuk7b33RJyVA/exec
// ============================================================

var SSID = '1sD604FpRUbi8mkT00DJxK3ErujIyhaxYzL302nuD7_A';
var KPI_TAB = '여정별 KPI Manager';
var HISTORY_TAB = 'KPI_변경이력';
var REVIEW_TAB = 'KPI_검토_요청';
var NUM_COLS = 11;

// KPI 컬럼 인덱스 (0-based)
var COL = { L1:0, L2:1, NAME:2, DESC:3, FORMULA:4, CYCLE:5, EDITOR:6, EDIT_NOTE:7, DELETED:8, DELETED_BY:9, SOURCE:10 };
var COL_LABELS = ['L1','L2','KPI 지표명','KPI 설명','산식/정의','측정주기','수정한 사람','수정 내용','삭제여부','삭제한 사람','출처'];

function _getSheet() {
  var ss = SpreadsheetApp.openById(SSID);
  var ks = ss.getSheetByName(KPI_TAB);
  if (!ks) {
    var allTabs = ss.getSheets().map(function(s){ return s.getName(); }).join(', ');
    throw new Error('탭 "' + KPI_TAB + '"을 찾을 수 없음. 실제 탭 목록: ' + allTabs);
  }
  return ks;
}

function _getHistorySheet() {
  var ss = SpreadsheetApp.openById(SSID);
  return ss.getSheetByName(HISTORY_TAB);
}

// ============================================================
// GET
// ============================================================
function doGet(e) {
  try {
    Logger.log('doGet 호출: ' + JSON.stringify(e && e.parameter || {}));
    var ks = _getSheet();
    var lr = ks.getLastRow();
    var kpi = [];
    if (lr > 1) {
      var d = ks.getRange(2, 1, lr - 1, NUM_COLS).getValues();
      kpi = d.map(function(r) {
        var row = [];
        for (var i = 0; i < NUM_COLS; i++) {
          row.push(String(r[i] == null ? '' : r[i]));
        }
        return row;
      });
    }
    Logger.log('doGet 응답: ' + kpi.length + '행');
    var result = { status: 'ok', kpi: kpi, count: kpi.length, ts: new Date().toISOString(), tab: KPI_TAB, cols: NUM_COLS };
    var js = JSON.stringify(result);
    var cb = (e && e.parameter && e.parameter.callback) || '';
    if (cb) return ContentService.createTextOutput(cb + '(' + js + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
    return ContentService.createTextOutput(js).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log('doGet 에러: ' + err.toString());
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// POST
// ============================================================
function doPost(e) {
  try {
    Logger.log('doPost 호출. param keys: ' + Object.keys(e.parameter||{}).join(',') +
               ', postData type: ' + (e.postData && e.postData.type));
    var body;
    if (e.parameter && e.parameter.data) {
      body = JSON.parse(e.parameter.data);
    } else if (e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    } else {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'no data' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (body.action === 'sync' && body.data) {
      return _syncWithDiff(body);
    }
    if (body.action === 'applyChanges') {
      return _applyChanges(body);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'unknown action: ' + body.action }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log('doPost 에러: ' + err.toString() + '\n' + err.stack);
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ────────────────────────────────────────────────────────────
// sync — 기존 동작 유지 + diff 자동 로깅
// ────────────────────────────────────────────────────────────
function _syncWithDiff(body) {
  var ks = _getSheet();
  var hs = _getHistorySheet();
  var data = body.data || [];
  var syncEditor = body.editor || '(sync)';
  var defaultReason = body.reason || '대시보드 동기화';

  // 1) 기존 데이터 스냅샷
  var lr = ks.getLastRow();
  var prevRows = [];
  if (lr > 1) {
    prevRows = ks.getRange(2, 1, lr - 1, NUM_COLS).getValues();
  }

  // 2) 데이터 정규화 (10열 패딩)
  var padded = data.map(function(r) {
    if (!Array.isArray(r)) r = [];
    while (r.length < NUM_COLS) r.push('');
    return r.slice(0, NUM_COLS);
  });

  // 3) 덮어쓰기
  if (lr > 1) {
    ks.getRange(2, 1, lr - 1, NUM_COLS).clearContent();
  }
  if (padded.length > 0) {
    ks.getRange(2, 1, padded.length, NUM_COLS).setValues(padded);
  }
  SpreadsheetApp.flush();

  // 4) diff 계산 → 변경이력 기록
  var logged = 0;
  if (hs) {
    try {
      logged = _computeAndLogDiff(prevRows, padded, syncEditor, defaultReason);
    } catch (err) {
      Logger.log('diff 로깅 실패: ' + err.toString());
    }
  } else {
    Logger.log('⚠️ ' + HISTORY_TAB + ' 탭 없음. diff 로깅 생략. initKpiHistoryTab() 실행 권장.');
  }

  return ContentService.createTextOutput(JSON.stringify({
    status: 'ok',
    synced: padded.length,
    logged: logged,
    ts: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

// prev/next 둘 다 10열 배열의 배열. 키: (L1, L2, KPI지표명) — 단, 중복 시 첫 매치 우선.
// 차이를 변경이력 행으로 append.
function _computeAndLogDiff(prevRows, nextRows, defaultEditor, defaultReason) {
  function key(r) { return [r[COL.L1], r[COL.L2], r[COL.NAME]].join('::'); }
  function isDeleted(r) { return String(r[COL.DELETED]).toUpperCase() === 'Y'; }

  var prevMap = {};
  for (var i = 0; i < prevRows.length; i++) {
    var k = key(prevRows[i]);
    if (!(k in prevMap)) prevMap[k] = prevRows[i];
  }
  var nextMap = {};
  for (var j = 0; j < nextRows.length; j++) {
    var k2 = key(nextRows[j]);
    if (!(k2 in nextMap)) nextMap[k2] = nextRows[j];
  }

  var logs = [];

  // 추가/수정 검사
  for (var nk in nextMap) {
    var nr = nextMap[nk];
    var pr = prevMap[nk];
    var editor = String(nr[COL.EDITOR] || defaultEditor);
    var note = String(nr[COL.EDIT_NOTE] || '');

    if (!pr) {
      // 신규 행
      logs.push(_kpiLogEntry({
        editor: editor,
        type: isDeleted(nr) ? '삭제' : '추가',
        l1: nr[COL.L1], l2: nr[COL.L2], name: nr[COL.NAME],
        field: '', oldValue: '', newValue: _summarize(nr),
        reason: note || defaultReason
      }));
      continue;
    }

    // 기존 행 — 컬럼별 비교 (메타 컬럼 G/H는 비교 대상에서 제외하되 변경자/사유 출처로 사용)
    var fieldsToCompare = [COL.L1, COL.L2, COL.NAME, COL.DESC, COL.FORMULA, COL.CYCLE, COL.DELETED, COL.DELETED_BY, COL.SOURCE];
    var anyChange = false;
    for (var fi = 0; fi < fieldsToCompare.length; fi++) {
      var idx = fieldsToCompare[fi];
      var oldV = String(pr[idx] == null ? '' : pr[idx]);
      var newV = String(nr[idx] == null ? '' : nr[idx]);
      if (oldV !== newV) {
        anyChange = true;
        var type = '수정';
        if (idx === COL.DELETED) {
          if (newV.toUpperCase() === 'Y' && oldV.toUpperCase() !== 'Y') type = '삭제';
          else if (newV.toUpperCase() !== 'Y' && oldV.toUpperCase() === 'Y') type = '복구';
        }
        logs.push(_kpiLogEntry({
          editor: editor,
          type: type,
          l1: nr[COL.L1], l2: nr[COL.L2], name: nr[COL.NAME],
          field: COL_LABELS[idx],
          oldValue: oldV, newValue: newV,
          reason: note || defaultReason
        }));
      }
    }
    if (!anyChange) {
      // 변경 없음 → 로그 X
    }
  }

  // 삭제(누락) 검사: prev에 있었는데 next에 없는 키
  for (var pk in prevMap) {
    if (!(pk in nextMap)) {
      var prr = prevMap[pk];
      logs.push(_kpiLogEntry({
        editor: defaultEditor,
        type: '삭제(누락)',
        l1: prr[COL.L1], l2: prr[COL.L2], name: prr[COL.NAME],
        field: '', oldValue: _summarize(prr), newValue: '',
        reason: defaultReason + ' — 동기화 데이터에 누락됨'
      }));
    }
  }

  // 일괄 append
  if (logs.length === 0) return 0;
  var hs = _getHistorySheet();
  hs.getRange(hs.getLastRow() + 1, 1, logs.length, 10).setValues(logs);
  return logs.length;
}

// 변경이력 한 행을 10열 배열로 생성
function _kpiLogEntry(o) {
  var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  return [
    now,
    o.editor || '',
    o.type || '',
    o.l1 || '',
    o.l2 || '',
    o.name || '',
    o.field || '',
    o.oldValue || '',
    o.newValue || '',
    o.reason || ''
  ];
}

function _summarize(row) {
  // 신규 행/삭제 행을 한 줄로 요약 (가독성 위해 핵심 필드만)
  var parts = [];
  if (row[COL.DESC]) parts.push('설명=' + String(row[COL.DESC]).substring(0, 60));
  if (row[COL.FORMULA]) parts.push('산식=' + String(row[COL.FORMULA]).substring(0, 60));
  if (row[COL.CYCLE]) parts.push('주기=' + row[COL.CYCLE]);
  return parts.join(' / ');
}

// ────────────────────────────────────────────────────────────
// applyChanges — 외부 일괄 호출 (사유 명시)
// ────────────────────────────────────────────────────────────
// body 예:
// {
//   "action": "applyChanges",
//   "editor": "홍길동",
//   "changes": [
//     {
//       "op": "addRow",
//       "row": ["인입","","신규 KPI","설명","산식","월간","홍길동","수동 추가","",""],
//       "log": { "type":"추가","l1":"인입","l2":"","name":"신규 KPI","field":"","oldValue":"","newValue":"...","reason":"REQ_XXX" }
//     },
//     {
//       "op": "updateRowByKey",
//       "key": {"l1":"인입","l2":"","name":"전체 인입 전환율 (Acquisition Conversion Rate)"},
//       "updates": {"산식/정의":"...","측정주기":"주간"},
//       "log": { ... }
//     },
//     {
//       "op": "softDelete",
//       "key": {...},
//       "deletedBy": "홍길동",
//       "log": { ... }
//     },
//     {
//       "op": "logOnly",
//       "log": { ... }
//     }
//   ]
// }
function _applyChanges(body) {
  var ks = _getSheet();
  var hs = _getHistorySheet();
  if (!hs) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error', message: HISTORY_TAB + ' 탭이 없습니다. initKpiHistoryTab() 먼저 실행하세요.'
    })).setMimeType(ContentService.MimeType.JSON);
  }

  var editor = body.editor || '(미지정)';
  var changes = body.changes || [];
  var results = [];

  for (var i = 0; i < changes.length; i++) {
    var ch = changes[i];
    var result = { idx: i, op: ch.op, reason: ch.log && ch.log.reason };
    try {
      if (ch.op === 'addRow') {
        if (!Array.isArray(ch.row) || ch.row.length !== NUM_COLS) {
          throw new Error('addRow: row는 ' + NUM_COLS + '열 배열이어야 합니다');
        }
        ks.appendRow(ch.row);
      } else if (ch.op === 'updateRowByKey') {
        var r1 = _findKpiRowByKey(ks, ch.key);
        if (r1 < 0) throw new Error('대상 행 없음: ' + JSON.stringify(ch.key));
        var updates = ch.updates || {};
        for (var label in updates) {
          var colIdx = COL_LABELS.indexOf(label);
          if (colIdx < 0) throw new Error('컬럼명 잘못됨: ' + label);
          ks.getRange(r1, colIdx + 1).setValue(updates[label]);
        }
      } else if (ch.op === 'softDelete') {
        var r2 = _findKpiRowByKey(ks, ch.key);
        if (r2 < 0) throw new Error('대상 행 없음: ' + JSON.stringify(ch.key));
        ks.getRange(r2, COL.DELETED + 1).setValue('Y');
        ks.getRange(r2, COL.DELETED_BY + 1).setValue(ch.deletedBy || editor);
      } else if (ch.op === 'restore') {
        var r3 = _findKpiRowByKey(ks, ch.key);
        if (r3 < 0) throw new Error('대상 행 없음: ' + JSON.stringify(ch.key));
        ks.getRange(r3, COL.DELETED + 1).setValue('');
        ks.getRange(r3, COL.DELETED_BY + 1).setValue('');
      } else if (ch.op === 'logOnly') {
        // 시트 변경 없음
      } else {
        throw new Error('알 수 없는 op: ' + ch.op);
      }

      // 변경이력 로깅
      if (ch.log) {
        hs.appendRow(_kpiLogEntry({
          editor: editor,
          type: ch.log.type, l1: ch.log.l1, l2: ch.log.l2, name: ch.log.name,
          field: ch.log.field, oldValue: ch.log.oldValue, newValue: ch.log.newValue,
          reason: ch.log.reason
        }));
      }
      result.ok = true;
    } catch (err) {
      result.ok = false;
      result.error = err.toString();
    }
    results.push(result);
  }

  SpreadsheetApp.flush();

  return ContentService.createTextOutput(JSON.stringify({
    status: 'ok',
    applied: results.filter(function(r){return r.ok;}).length,
    failed: results.filter(function(r){return !r.ok;}).length,
    results: results,
    ts: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

function _findKpiRowByKey(sheet, key) {
  if (!key) return -1;
  var lr = sheet.getLastRow();
  if (lr < 2) return -1;
  var vals = sheet.getRange(2, 1, lr - 1, 3).getValues(); // L1, L2, NAME만 검색
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(key.l1 || '') &&
        String(vals[i][1]) === String(key.l2 || '') &&
        String(vals[i][2]) === String(key.name || '')) {
      return i + 2;
    }
  }
  return -1;
}

// ============================================================
// 변경이력 탭 초기화 (1회성)
// ============================================================
function initKpiHistoryTab() {
  var ss = SpreadsheetApp.openById(SSID);
  var hs = ss.getSheetByName(HISTORY_TAB);
  if (hs) {
    Logger.log('⚠️ 이미 존재함: ' + HISTORY_TAB + ' (수정 안 함)');
    return;
  }
  hs = ss.insertSheet(HISTORY_TAB);
  hs.appendRow([
    '타임스탬프','변경자','변경유형','L1','L2','KPI 지표명','변경 필드','이전값','새값','사유'
  ]);
  hs.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#f0f0f0');
  hs.setFrozenRows(1);
  hs.setColumnWidth(1, 150);  // 타임스탬프
  hs.setColumnWidth(2, 140);  // 변경자
  hs.setColumnWidth(3, 80);   // 변경유형
  hs.setColumnWidth(6, 220);  // KPI 지표명
  hs.setColumnWidth(7, 110);  // 변경 필드
  hs.setColumnWidth(8, 220);  // 이전값
  hs.setColumnWidth(9, 220);  // 새값
  hs.setColumnWidth(10, 160); // 사유
  Logger.log('✅ 생성 완료: ' + HISTORY_TAB);
}

// ============================================================
// onEdit: 시트 직접 편집 자동 로깅 (simple trigger)
// ============================================================
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var sheet = e.range.getSheet();
    if (sheet.getName() !== KPI_TAB) return;

    var row = e.range.getRow();
    var col = e.range.getColumn();
    if (row < 2) return;                // 헤더 무시
    if (col < 1 || col > NUM_COLS) return;

    var oldValue = (e.oldValue === undefined || e.oldValue === null) ? '' : String(e.oldValue);
    var newValue = (e.value === undefined || e.value === null) ? '' : String(e.value);
    if (oldValue === newValue) return;

    var rowVals = sheet.getRange(row, 1, 1, NUM_COLS).getValues()[0];
    var field = COL_LABELS[col - 1];

    var type = '수정';
    if (col === COL.DELETED + 1) {
      if (newValue.toUpperCase() === 'Y') type = '삭제';
      else if (oldValue.toUpperCase() === 'Y' && newValue === '') type = '복구';
    } else if (oldValue === '' && newValue !== '') type = '추가';
    else if (oldValue !== '' && newValue === '') type = '삭제';

    var editor = '';
    try {
      var u = Session.getActiveUser();
      editor = (u && u.getEmail()) ? u.getEmail() : '(unknown)';
    } catch (_) { editor = '(unknown)'; }

    var hs = _getHistorySheet();
    if (!hs) return; // 탭 없으면 silent

    hs.appendRow(_kpiLogEntry({
      editor: editor,
      type: type,
      l1: rowVals[COL.L1], l2: rowVals[COL.L2], name: rowVals[COL.NAME],
      field: field,
      oldValue: oldValue, newValue: newValue,
      reason: '(시트 직접 편집)'
    }));
  } catch (err) {
    Logger.log('onEdit 로깅 실패: ' + err.toString());
  }
}

// ============================================================
// 진단/테스트
// ============================================================
function diagnose() {
  try {
    var ss = SpreadsheetApp.openById(SSID);
    Logger.log('✅ 스프레드시트 열기 성공: ' + ss.getName());
    var tabs = ss.getSheets().map(function(s){ return s.getName(); });
    Logger.log('📋 탭 목록: ' + tabs.join(' | '));
    Logger.log('   ' + KPI_TAB + ': ' + (ss.getSheetByName(KPI_TAB) ? '✅' : '❌'));
    Logger.log('   ' + HISTORY_TAB + ': ' + (ss.getSheetByName(HISTORY_TAB) ? '✅' : '❌ → initKpiHistoryTab() 실행 필요'));
    var ks = ss.getSheetByName(KPI_TAB);
    if (ks) {
      var lr = ks.getLastRow();
      Logger.log('📊 KPI 데이터: ' + Math.max(0, lr - 1) + '행');
      if (lr > 1) {
        var allData = ks.getRange(2, 1, lr - 1, NUM_COLS).getValues();
        var deletedCount = allData.filter(function(r){ return String(r[COL.DELETED]).toUpperCase() === 'Y'; }).length;
        Logger.log('🗑️ Soft-deleted: ' + deletedCount + '건');
      }
    }
  } catch (err) {
    Logger.log('❌ 진단 실패: ' + err.toString());
  }
}

function testSync() {
  var fakeRequest = {
    parameter: {},
    postData: {
      type: 'application/json',
      contents: JSON.stringify({
        action: 'sync',
        editor: '(testSync)',
        reason: 'testSync 실행',
        data: [
          ['테스트L1','테스트L2','테스트 KPI(활성)','설명','산식','월간','테스터','testSync 실행','',''],
          ['테스트L1','테스트L2','테스트 KPI(삭제됨)','설명','산식','월간','테스터','testSync 실행','Y','홍길동']
        ]
      })
    }
  };
  var result = doPost(fakeRequest);
  Logger.log('testSync 결과: ' + result.getContent());
}

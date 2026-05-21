// ============================================================
// SKT 고객여정 KPI Dashboard — Google Apps Script (v9)
// ============================================================
// v8 대비 변경 (2026-05-21):
// - NUM_COLS 11 → 7로 축소: 수정한 사람/수정 내용/삭제여부/삭제한 사람 4컬럼 제거
// - 출처 컬럼이 G로 이동 (기존 K)
// - softDelete/restore 액션 제거 (시트에 컬럼 없음)
// - 신규 액션 submitReview: KPI 대시보드에서 추가/수정/삭제 요청을 KPI_검토_요청 시트에 접수
//
// v8 (2026-05-21): K열 "출처" 추가
// v7 (2026-05-20): KPI_변경이력 / onEdit / applyChanges / sync diff
//
// 시트 컬럼 (7열): A:L1, B:L2, C:KPI지표명, D:KPI설명, E:산식/정의, F:측정주기, G:출처
//
// 연결된 웹 엔드포인트:
//   https://script.google.com/macros/s/AKfycbwckTK8mJb1nf3ZZ1rPG7114DJJzgu0T93wdQi4S6LpvHf3MqqIlnxxa7zuk7b33RJyVA/exec
// ============================================================

var SSID = '1sD604FpRUbi8mkT00DJxK3ErujIyhaxYzL302nuD7_A';
var KPI_TAB = '여정별 KPI Manager';
var HISTORY_TAB = 'KPI_변경이력';
var REVIEW_TAB = 'KPI_검토_요청';
var NUM_COLS = 7;

// KPI 컬럼 인덱스 (0-based)
var COL = { L1:0, L2:1, NAME:2, DESC:3, FORMULA:4, CYCLE:5, SOURCE:6 };
var COL_LABELS = ['L1','L2','KPI 지표명','KPI 설명','산식/정의','측정주기','출처'];

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

function _getReviewSheet() {
  var ss = SpreadsheetApp.openById(SSID);
  return ss.getSheetByName(REVIEW_TAB);
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
// POST 라우터
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

    // 신규: 대시보드에서 KPI 추가/수정/삭제 요청 접수
    if (body.action === 'submitReview') {
      return _submitReview(body);
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
// submitReview — KPI 대시보드에서 추가/수정/삭제 요청 접수
// ────────────────────────────────────────────────────────────
// body 예:
// {
//   "action": "submitReview",
//   "reqType": "추가" | "수정" | "삭제",
//   "l1": "서비스 이용",
//   "l2Code": "use_info",
//   "l2Name": "나의 가입정보 관리",
//   "kpiName": "약정 만료 후 재약정 전환율",
//   "content": "[산식] ... [정의] ... [기타] ...",
//   "requester": "홍길동"
// }
function _submitReview(body) {
  var rs = _getReviewSheet();
  if (!rs) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'KPI_검토_요청 탭을 찾을 수 없음'
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // 요청 ID 자동 채번 (KPI_REQ_NNN)
  var lr = rs.getLastRow();
  var nextNum = 1;
  if (lr > 1) {
    for (var i = lr; i >= 2; i--) {
      var cellVal = String(rs.getRange(i, 1).getValue());
      var match = cellVal.match(/KPI_REQ_(\d+)/);
      if (match) {
        nextNum = parseInt(match[1]) + 1;
        break;
      }
    }
  }
  var reqId = 'KPI_REQ_' + ('00' + nextNum).slice(-3);

  var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');

  // KPI_검토_요청 컬럼 (11열):
  // A:요청ID, B:요청유형, C:L1, D:L2 Code, E:L2 Name, F:대상 KPI 지표명,
  // G:요청 내용, H:요청자, I:요청 일시, J:처리 상태, K:관리자 메모
  var newRow = [
    reqId,
    body.reqType || '추가',
    body.l1 || '',
    body.l2Code || '',
    body.l2Name || '',
    body.kpiName || '',
    body.content || '',
    body.requester || '',
    now,
    '대기',
    ''
  ];

  rs.appendRow(newRow);

  return ContentService.createTextOutput(JSON.stringify({
    status: 'ok',
    reqId: reqId,
    message: '요청이 접수되었습니다.'
  })).setMimeType(ContentService.MimeType.JSON);
}

// ────────────────────────────────────────────────────────────
// sync — 기존 동작 유지 + diff 자동 로깅 (7열로 축소)
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

  // 2) 데이터 정규화 (7열 패딩)
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

// prev/next 둘 다 7열 배열의 배열. 키: (L1, L2, KPI지표명).
function _computeAndLogDiff(prevRows, nextRows, defaultEditor, defaultReason) {
  function key(r) { return [r[COL.L1], r[COL.L2], r[COL.NAME]].join('::'); }

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
    var editor = defaultEditor;

    if (!pr) {
      logs.push(_kpiLogEntry({
        editor: editor,
        type: '추가',
        l1: nr[COL.L1], l2: nr[COL.L2], name: nr[COL.NAME],
        field: '', oldValue: '', newValue: _summarize(nr),
        reason: defaultReason
      }));
      continue;
    }

    // 비교: L1, L2, NAME, DESC, FORMULA, CYCLE, SOURCE
    var fieldsToCompare = [COL.L1, COL.L2, COL.NAME, COL.DESC, COL.FORMULA, COL.CYCLE, COL.SOURCE];
    for (var fi = 0; fi < fieldsToCompare.length; fi++) {
      var idx = fieldsToCompare[fi];
      var oldV = String(pr[idx] == null ? '' : pr[idx]);
      var newV = String(nr[idx] == null ? '' : nr[idx]);
      if (oldV !== newV) {
        logs.push(_kpiLogEntry({
          editor: editor,
          type: '수정',
          l1: nr[COL.L1], l2: nr[COL.L2], name: nr[COL.NAME],
          field: COL_LABELS[idx],
          oldValue: oldV, newValue: newV,
          reason: defaultReason
        }));
      }
    }
  }

  // 삭제(누락) 검사
  for (var pk in prevMap) {
    if (!(pk in nextMap)) {
      var prr = prevMap[pk];
      logs.push(_kpiLogEntry({
        editor: defaultEditor,
        type: '삭제',
        l1: prr[COL.L1], l2: prr[COL.L2], name: prr[COL.NAME],
        field: '', oldValue: _summarize(prr), newValue: '',
        reason: defaultReason + ' — 동기화 데이터에 누락'
      }));
    }
  }

  if (logs.length === 0) return 0;
  var hs = _getHistorySheet();
  hs.getRange(hs.getLastRow() + 1, 1, logs.length, 10).setValues(logs);
  return logs.length;
}

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
  var parts = [];
  if (row[COL.DESC]) parts.push('설명=' + String(row[COL.DESC]).substring(0, 60));
  if (row[COL.FORMULA]) parts.push('산식=' + String(row[COL.FORMULA]).substring(0, 60));
  if (row[COL.CYCLE]) parts.push('주기=' + row[COL.CYCLE]);
  if (row[COL.SOURCE]) parts.push('출처=' + row[COL.SOURCE]);
  return parts.join(' / ');
}

// ────────────────────────────────────────────────────────────
// applyChanges — 외부 일괄 호출 (관리자용, 7열 기준)
// ────────────────────────────────────────────────────────────
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
      } else if (ch.op === 'deleteRowByKey') {
        var r2 = _findKpiRowByKey(ks, ch.key);
        if (r2 < 0) throw new Error('대상 행 없음: ' + JSON.stringify(ch.key));
        ks.deleteRow(r2);
      } else if (ch.op === 'logOnly') {
        // 시트 변경 없음
      } else {
        throw new Error('알 수 없는 op: ' + ch.op);
      }

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
  var vals = sheet.getRange(2, 1, lr - 1, 3).getValues();
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
    Logger.log('⚠️ 이미 존재함: ' + HISTORY_TAB);
    return;
  }
  hs = ss.insertSheet(HISTORY_TAB);
  hs.appendRow([
    '타임스탬프','변경자','변경유형','L1','L2','KPI 지표명','변경 필드','이전값','새값','사유'
  ]);
  hs.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#f0f0f0');
  hs.setFrozenRows(1);
  Logger.log('✅ 생성 완료: ' + HISTORY_TAB);
}

// ============================================================
// onEdit: 시트 직접 편집 자동 로깅 (7열 기준)
// ============================================================
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var sheet = e.range.getSheet();
    if (sheet.getName() !== KPI_TAB) return;

    var row = e.range.getRow();
    var col = e.range.getColumn();
    if (row < 2) return;
    if (col < 1 || col > NUM_COLS) return;

    var oldValue = (e.oldValue === undefined || e.oldValue === null) ? '' : String(e.oldValue);
    var newValue = (e.value === undefined || e.value === null) ? '' : String(e.value);
    if (oldValue === newValue) return;

    var rowVals = sheet.getRange(row, 1, 1, NUM_COLS).getValues()[0];
    var field = COL_LABELS[col - 1];

    var type = '수정';
    if (oldValue === '' && newValue !== '') type = '추가';
    else if (oldValue !== '' && newValue === '') type = '삭제';

    var editor = '';
    try {
      var u = Session.getActiveUser();
      editor = (u && u.getEmail()) ? u.getEmail() : '(unknown)';
    } catch (_) { editor = '(unknown)'; }

    var hs = _getHistorySheet();
    if (!hs) return;

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
    Logger.log('   ' + HISTORY_TAB + ': ' + (ss.getSheetByName(HISTORY_TAB) ? '✅' : '❌'));
    Logger.log('   ' + REVIEW_TAB + ': ' + (ss.getSheetByName(REVIEW_TAB) ? '✅' : '❌'));
    var ks = ss.getSheetByName(KPI_TAB);
    if (ks) {
      var lr = ks.getLastRow();
      Logger.log('📊 KPI 데이터: ' + Math.max(0, lr - 1) + '행 (' + NUM_COLS + '열 기준)');
    }
  } catch (err) {
    Logger.log('❌ 진단 실패: ' + err.toString());
  }
}

function testSubmitReview() {
  var fakeRequest = {
    parameter: {},
    postData: {
      type: 'application/json',
      contents: JSON.stringify({
        action: 'submitReview',
        reqType: '추가',
        l1: '서비스 이용',
        l2Code: 'use_info',
        l2Name: '나의 가입정보 관리',
        kpiName: '(테스트) testSubmitReview KPI',
        content: '[산식] 테스트 / [정의] testSubmitReview 함수에서 생성',
        requester: '(테스트)'
      })
    }
  };
  var result = doPost(fakeRequest);
  Logger.log('testSubmitReview 결과: ' + result.getContent());
  Logger.log('→ KPI_검토_요청 탭의 마지막 행 확인. 확인 후 그 행 삭제하세요.');
}

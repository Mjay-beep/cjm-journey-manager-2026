// ============================================================
// SKT 고객여정 Dashboard — Google Apps Script (v3)
// ============================================================
// 변경사항 (v3, 2026-05-20):
//   - CJM_변경이력 탭 도입 (append-only audit log)
//   - onEdit 트리거: 시트 직접 편집 시 자동 로깅
//   - doPost 새 액션: applyChanges (일괄 반영 + 사유 포함 로깅)
//   - initHistoryTab(): 변경이력 탭 헤더 1회 생성용
//
// 변경사항 (v2):
//   - getDataRange() → getRange(1,1,lastRow,8) 로 변경하여 빈 행 방지
//   - 빈 행 필터링 추가
//   - H열 'source' → 'channels'
//
// 배포 방법:
//   [배포] > [배포 관리] > 연필 아이콘 > 버전: 새 버전 > [배포]
//
// 연결된 웹 엔드포인트:
//   https://script.google.com/macros/s/AKfycbwY-ZSmquMDmWaY39m_-CeTauo5ZXKrkyt8taQCsc-32bFj0YG_AjUEgwKz7mF01D2nEg/exec
// ============================================================

// ── 설정 ──
const SPREADSHEET_ID = '1sD604FpRUbi8mkT00DJxK3ErujIyhaxYzL302nuD7_A';
const JOURNEY_TAB    = '고객여정 Manager';
const REVIEW_TAB     = '검토_요청';
const HISTORY_TAB    = 'CJM_변경이력';

// 고객여정 Manager 컬럼 순서 (1행 1열 = 1)
const COL_MAP = {l1:1, l2Code:2, l2Name:3, l3Code:4, l3Name:5, l4Code:6, l4Name:7, channels:8};
const COL_NAMES = ['l1','l2Code','l2Name','l3Code','l3Name','l4Code','l4Name','channels'];

// ============================================================
// GET: 데이터 읽기 (기존 로직 유지)
// ============================================================
function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // 1) 여정 데이터
    const journeySheet = ss.getSheetByName(JOURNEY_TAB);
    const lastRowJ     = journeySheet.getLastRow();
    let journeyRows = [];
    if (lastRowJ > 2) {
      const journeyData = journeySheet.getRange(1, 1, lastRowJ, 8).getValues();
      journeyRows = journeyData
        .slice(2)
        .filter(function(row) {
          return row[0] || row[1] || row[2] || row[3] || row[4] || row[5] || row[6];
        })
        .map(function(row) {
          return {
            l1:       String(row[0] || ''),
            l2Code:   String(row[1] || ''),
            l2Name:   String(row[2] || ''),
            l3Code:   String(row[3] || ''),
            l3Name:   String(row[4] || ''),
            l4Code:   String(row[5] || ''),
            l4Name:   String(row[6] || ''),
            channels: String(row[7] || '')
          };
        });
    }

    // 2) 대기 검토 요청
    const reviewSheet = ss.getSheetByName(REVIEW_TAB);
    const lastRowR    = reviewSheet.getLastRow();
    let pendingReviews = [];
    if (lastRowR > 2) {
      const reviewData = reviewSheet.getRange(1, 1, lastRowR, 14).getValues();
      pendingReviews = reviewData
        .slice(2)
        .filter(function(row) { return String(row[12]).trim() === '대기'; })
        .map(function(row) {
          return {
            reqId: String(row[0] || ''), reqType: String(row[1] || ''),
            l1: String(row[2] || ''), l2Code: String(row[3] || ''), l2Name: String(row[4] || ''),
            l3Code: String(row[5] || ''), l3Name: String(row[6] || ''),
            l4Code: String(row[7] || ''), l4Name: String(row[8] || ''),
            content: String(row[9] || ''), requester: String(row[10] || ''),
            reqDate: String(row[11] || ''), status: String(row[12] || ''),
            adminMemo: String(row[13] || '')
          };
        });
    }

    var result = {
      success: true,
      journey: journeyRows,
      pendingReviews: pendingReviews,
      meta: {
        journeyRowCount: journeyRows.length,
        pendingCount: pendingReviews.length,
        timestamp: Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss')
      }
    };
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false, error: error.message, stack: error.stack
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// POST: 라우터 (기존 검토_요청 접수 + 신규 applyChanges)
// ============================================================
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    // 신규: 일괄 반영
    if (body.action === 'applyChanges') {
      return _applyChanges(body);
    }
    // 기존: 검토_요청 접수
    return _submitReview(body);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false, error: error.message, stack: error.stack
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ────────────────────────────────────────────────────────────
// 기존: 검토_요청 접수
// ────────────────────────────────────────────────────────────
function _submitReview(body) {
  var ss   = SpreadsheetApp.openById(SPREADSHEET_ID);
  var reviewSheet = ss.getSheetByName(REVIEW_TAB);

  // 요청 ID 자동 채번
  var lastRow = reviewSheet.getLastRow();
  var nextNum = 1;
  if (lastRow > 1) {
    for (var i = lastRow; i >= 2; i--) {
      var cellVal = String(reviewSheet.getRange(i, 1).getValue());
      var match = cellVal.match(/REQ_(\d+)/);
      if (match) { nextNum = parseInt(match[1]) + 1; break; }
    }
  }
  var reqId = 'REQ_' + ('000' + nextNum).slice(-3);
  var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');

  var newRow = [
    reqId, body.reqType || '', body.l1 || '',
    body.l2Code || '', body.l2Name || '',
    body.l3Code || '', body.l3Name || '',
    body.l4Code || '', body.l4Name || '',
    body.content || '', body.requester || '',
    now, '대기', ''
  ];
  reviewSheet.appendRow(newRow);

  return ContentService.createTextOutput(JSON.stringify({
    success: true, reqId: reqId, message: '요청이 접수되었습니다.'
  })).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// 변경이력 탭 초기화 (1회성)
// ============================================================
function initHistoryTab() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var hs = ss.getSheetByName(HISTORY_TAB);
  if (hs) {
    Logger.log('⚠️ 이미 존재함: ' + HISTORY_TAB + ' (수정 안 함)');
    return;
  }
  hs = ss.insertSheet(HISTORY_TAB);
  hs.appendRow([
    '타임스탬프', '변경자', '변경유형', '대상 레벨',
    'L1', 'L2 Code', 'L2 Name', 'L3 Code', 'L3 Name', 'L4 Code', 'L4 Name',
    '변경 필드', '이전값', '새값', '사유'
  ]);
  hs.getRange(1, 1, 1, 15)
    .setFontWeight('bold')
    .setBackground('#f0f0f0');
  hs.setFrozenRows(1);
  // 컬럼 너비 권장
  hs.setColumnWidth(1, 150); // 타임스탬프
  hs.setColumnWidth(2, 140); // 변경자
  hs.setColumnWidth(3, 80);  // 변경유형
  hs.setColumnWidth(4, 80);  // 대상 레벨
  hs.setColumnWidth(12, 110); // 변경 필드
  hs.setColumnWidth(13, 200); // 이전값
  hs.setColumnWidth(14, 200); // 새값
  hs.setColumnWidth(15, 160); // 사유
  Logger.log('✅ 생성 완료: ' + HISTORY_TAB);
}

// ============================================================
// 변경이력 로깅 헬퍼
// ============================================================
function _logChange(entry) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var hs = ss.getSheetByName(HISTORY_TAB);
  if (!hs) {
    Logger.log('❌ ' + HISTORY_TAB + ' 탭 없음. initHistoryTab() 먼저 실행 필요.');
    return false;
  }
  var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  hs.appendRow([
    now,
    entry.editor || '',
    entry.type || '',
    entry.level || '',
    entry.l1 || '',
    entry.l2Code || '',
    entry.l2Name || '',
    entry.l3Code || '',
    entry.l3Name || '',
    entry.l4Code || '',
    entry.l4Name || '',
    entry.field || '',
    entry.oldValue || '',
    entry.newValue || '',
    entry.reason || ''
  ]);
  return true;
}

// ============================================================
// onEdit: 시트 직접 편집 자동 로깅 (simple trigger)
// ============================================================
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var sheet = e.range.getSheet();
    if (sheet.getName() !== JOURNEY_TAB) return;

    var row = e.range.getRow();
    var col = e.range.getColumn();

    // 헤더(1,2행) 편집은 무시
    if (row <= 2) return;
    // 8열 밖 편집은 무시
    if (col < 1 || col > 8) return;

    var field = COL_NAMES[col - 1];
    var oldValue = (e.oldValue === undefined || e.oldValue === null) ? '' : String(e.oldValue);
    var newValue = (e.value === undefined || e.value === null) ? '' : String(e.value);
    if (oldValue === newValue) return;

    // 해당 행의 식별 컨텍스트 캡처 (현재 행 8열)
    var rowVals = sheet.getRange(row, 1, 1, 8).getValues()[0];

    // 변경 유형 추론
    var type = '수정';
    if (oldValue === '' && newValue !== '') type = '추가';
    else if (oldValue !== '' && newValue === '') type = '삭제';

    // 변경 레벨 추론
    var level = '';
    if (field === 'l1') level = 'L1';
    else if (field === 'l2Code' || field === 'l2Name') level = 'L2';
    else if (field === 'l3Code' || field === 'l3Name') level = 'L3';
    else level = 'L4'; // l4Code, l4Name, channels

    // 변경자: 자유 텍스트 입력은 불가능 → 이메일 자동 캡처
    // 사용자가 사후에 변경이력 행의 '변경자' 셀을 자유롭게 수정 가능
    var editor = '';
    try {
      var u = Session.getActiveUser();
      editor = (u && u.getEmail()) ? u.getEmail() : '(unknown)';
    } catch (_) { editor = '(unknown)'; }

    _logChange({
      editor: editor,
      type: type,
      level: level,
      l1: rowVals[0], l2Code: rowVals[1], l2Name: rowVals[2],
      l3Code: rowVals[3], l3Name: rowVals[4],
      l4Code: rowVals[5], l4Name: rowVals[6],
      field: field,
      oldValue: oldValue, newValue: newValue,
      reason: '(시트 직접 편집)'
    });
  } catch (err) {
    Logger.log('onEdit 로깅 실패: ' + err.toString());
  }
}

// ============================================================
// applyChanges: 일괄 반영 API (사유 포함)
// ============================================================
// 요청 본문 예시:
// {
//   "action": "applyChanges",
//   "editor": "홍길동",
//   "changes": [
//     {
//       "op": "addRow",
//       "row": ["", "", "", "", "", "ent_app_auth_03", "신용카드 인증", "ALL"],
//       "log": {
//         "type": "추가", "level": "L4",
//         "l1": "인입", "l2Code": "ent_app", "l2Name": "(T4S) 공식 앱/사이트 인입",
//         "l3Code": "ent_app_auth", "l3Name": "본인인증",
//         "l4Code": "ent_app_auth_03", "l4Name": "신용카드 인증",
//         "field": "", "oldValue": "", "newValue": "ent_app_auth_03 | 신용카드 인증",
//         "reason": "REQ_003"
//       }
//     },
//     {
//       "op": "updateCellByCode",
//       "findCode": "use_benefit_card_01",
//       "findField": "l4Code",
//       "updateField": "l4Name",
//       "newValue": "매직바코드 사용 (우주패스 포함)",
//       "log": { ... }
//     },
//     {
//       "op": "deleteRowByCode",
//       "findCode": "...",
//       "findField": "l4Code",
//       "log": { ... }
//     },
//     {
//       "op": "logOnly",
//       "log": { ... }   // 시트 변경 없이 이력만 남기고 싶을 때
//     }
//   ]
// }
function _applyChanges(body) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var js = ss.getSheetByName(JOURNEY_TAB);
  var editor = body.editor || '(미지정)';
  var changes = body.changes || [];
  var results = [];

  for (var i = 0; i < changes.length; i++) {
    var ch = changes[i];
    var result = { idx: i, reason: ch.log && ch.log.reason, op: ch.op };
    try {
      // 1) 시트 조작
      if (ch.op === 'addRow') {
        // ch.row: 8열 배열 (l1, l2Code, l2Name, l3Code, l3Name, l4Code, l4Name, channels)
        if (!Array.isArray(ch.row) || ch.row.length !== 8) {
          throw new Error('addRow: row는 8열 배열이어야 합니다');
        }
        if (ch.insertAfter && typeof ch.insertAfter === 'number') {
          js.insertRowAfter(ch.insertAfter);
          js.getRange(ch.insertAfter + 1, 1, 1, 8).setValues([ch.row]);
        } else {
          js.appendRow(ch.row);
        }
      } else if (ch.op === 'updateCellByCode') {
        var r1 = _findRowByCode(js, ch.findField, ch.findCode);
        if (r1 < 0) throw new Error('대상 행 없음: ' + ch.findField + '=' + ch.findCode);
        var col1 = COL_MAP[ch.updateField];
        if (!col1) throw new Error('updateField 잘못됨: ' + ch.updateField);
        js.getRange(r1, col1).setValue(ch.newValue || '');
      } else if (ch.op === 'deleteRowByCode') {
        var r2 = _findRowByCode(js, ch.findField, ch.findCode);
        if (r2 < 0) throw new Error('대상 행 없음: ' + ch.findField + '=' + ch.findCode);
        js.deleteRow(r2);
      } else if (ch.op === 'logOnly') {
        // 시트 변경 없음 — 이력만 기록
      } else {
        throw new Error('알 수 없는 op: ' + ch.op);
      }

      // 2) 변경이력 로깅
      if (ch.log) {
        _logChange({
          editor: editor,
          type: ch.log.type, level: ch.log.level,
          l1: ch.log.l1, l2Code: ch.log.l2Code, l2Name: ch.log.l2Name,
          l3Code: ch.log.l3Code, l3Name: ch.log.l3Name,
          l4Code: ch.log.l4Code, l4Name: ch.log.l4Name,
          field: ch.log.field,
          oldValue: ch.log.oldValue, newValue: ch.log.newValue,
          reason: ch.log.reason
        });
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
    success: true,
    applied: results.filter(function(r){ return r.ok; }).length,
    failed: results.filter(function(r){ return !r.ok; }).length,
    results: results,
    timestamp: Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss')
  })).setMimeType(ContentService.MimeType.JSON);
}

// findField (l4Code/l3Code/l2Code 등)에 findCode가 정확히 일치하는 첫 행 반환.
// 발견 못 하면 -1.
function _findRowByCode(sheet, findField, findCode) {
  var col = COL_MAP[findField];
  if (!col) return -1;
  var lr = sheet.getLastRow();
  if (lr < 3) return -1;
  var vals = sheet.getRange(3, col, lr - 2, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(findCode)) return i + 3;
  }
  return -1;
}

// ============================================================
// 진단/테스트
// ============================================================
function diagnose() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    Logger.log('✅ 스프레드시트 열기 성공: ' + ss.getName());
    var tabs = ss.getSheets().map(function(s){ return s.getName(); });
    Logger.log('📋 탭 목록: ' + tabs.join(' | '));
    Logger.log('   ' + JOURNEY_TAB + ': ' + (ss.getSheetByName(JOURNEY_TAB) ? '✅' : '❌'));
    Logger.log('   ' + REVIEW_TAB  + ': ' + (ss.getSheetByName(REVIEW_TAB)  ? '✅' : '❌'));
    Logger.log('   ' + HISTORY_TAB + ': ' + (ss.getSheetByName(HISTORY_TAB) ? '✅' : '❌ → initHistoryTab() 실행 필요'));
  } catch (err) {
    Logger.log('❌ 진단 실패: ' + err.toString());
  }
}

function testLog() {
  var ok = _logChange({
    editor: '(테스트)',
    type: '추가', level: 'L4',
    l1: '인입', l2Code: 'ent_app', l2Name: '(T4S) 공식 앱/사이트 인입',
    l3Code: 'ent_app_auth', l3Name: '본인인증',
    l4Code: 'ent_app_auth_TEST', l4Name: 'TEST',
    field: '', oldValue: '', newValue: 'ent_app_auth_TEST | TEST',
    reason: 'testLog() 실행'
  });
  Logger.log(ok ? '✅ 로깅 성공 → ' + HISTORY_TAB + ' 마지막 행 확인' : '❌ 로깅 실패');
}

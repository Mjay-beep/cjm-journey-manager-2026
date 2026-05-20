// ============================================================
// SKT 고객여정 KPI Dashboard — Google Apps Script (v6)
// ============================================================
// v5 대비 변경:
// - 8열 → 10열로 확장 (I: 삭제여부, J: 삭제한 사람)
// - Soft Delete 지원 (삭제여부=Y인 행도 시트에 보존, 클라이언트가 화면에서만 숨김)
// - testSync에 삭제 행 샘플 추가
//
// 시트 컬럼 구조 (10열):
// A: L1
// B: L2
// C: KPI 지표명
// D: KPI 설명
// E: 산식/정의
// F: 측정주기
// G: 수정한 사람
// H: 수정 내용
// I: 삭제여부 (Y / 빈값)        ← 신규
// J: 삭제한 사람                ← 신규
//
// 연결된 웹 엔드포인트:
//   https://script.google.com/macros/s/AKfycbwckTK8mJb1nf3ZZ1rPG7114DJJzgu0T93wdQi4S6LpvHf3MqqIlnxxa7zuk7b33RJyVA/exec
// ============================================================

var SSID = '1sD604FpRUbi8mkT00DJxK3ErujIyhaxYzL302nuD7_A';
var KPI_TAB = '여정별 KPI Manager';
var NUM_COLS = 10;  // 컬럼 수

function _getSheet() {
  var ss = SpreadsheetApp.openById(SSID);
  var ks = ss.getSheetByName(KPI_TAB);
  if (!ks) {
    var allTabs = ss.getSheets().map(function(s){ return s.getName(); }).join(', ');
    throw new Error('탭 "' + KPI_TAB + '"을 찾을 수 없음. 실제 탭 목록: ' + allTabs);
  }
  return ks;
}

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

function doPost(e) {
  try {
    Logger.log('doPost 호출. param keys: ' + Object.keys(e.parameter||{}).join(',') +
               ', postData type: ' + (e.postData && e.postData.type));
    var ks = _getSheet();

    // form POST(parameter.data), JSON POST(postData.contents), text/plain POST 모두 지원
    var body;
    if (e.parameter && e.parameter.data) {
      body = JSON.parse(e.parameter.data);
      Logger.log('parameter.data 방식으로 파싱');
    } else if (e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
      Logger.log('postData.contents 방식으로 파싱 (' + e.postData.contents.length + ' bytes)');
    } else {
      Logger.log('데이터 없음');
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'no data' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (body.action === 'sync' && body.data) {
      Logger.log('sync 시작: ' + body.data.length + '행 수신');

      // 기존 데이터 삭제 (헤더 유지)
      var lr = ks.getLastRow();
      if (lr > 1) {
        ks.getRange(2, 1, lr - 1, NUM_COLS).clearContent();
      }
      // 새 데이터 쓰기 (10열로 패딩)
      if (body.data.length > 0) {
        var padded = body.data.map(function(r) {
          if (!Array.isArray(r)) r = [];
          while (r.length < NUM_COLS) r.push('');
          return r.slice(0, NUM_COLS);
        });
        ks.getRange(2, 1, padded.length, NUM_COLS).setValues(padded);
      }
      SpreadsheetApp.flush();
      Logger.log('sync 완료');
      return ContentService.createTextOutput(JSON.stringify({ status: 'ok', synced: body.data.length, ts: new Date().toISOString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    Logger.log('알 수 없는 action: ' + body.action);
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'unknown action: ' + body.action }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('doPost 에러: ' + err.toString() + '\n' + err.stack);
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// 진단 함수: Apps Script 편집기에서 직접 실행해 환경을 확인
// ============================================================
function diagnose() {
  try {
    var ss = SpreadsheetApp.openById(SSID);
    Logger.log('✅ 스프레드시트 열기 성공: ' + ss.getName());

    var tabs = ss.getSheets().map(function(s){ return s.getName(); });
    Logger.log('📋 전체 탭 목록: ' + tabs.join(' | '));

    var ks = ss.getSheetByName(KPI_TAB);
    if (!ks) {
      Logger.log('❌ 탭 "' + KPI_TAB + '"이 존재하지 않음. 위 탭 목록과 정확히 일치하는지 확인하세요.');
      return;
    }
    Logger.log('✅ 탭 "' + KPI_TAB + '" 찾음');

    var lr = ks.getLastRow();
    var lc = ks.getLastColumn();
    Logger.log('📊 현재 데이터: ' + lr + '행 x ' + lc + '열');

    if (lr > 0) {
      var header = ks.getRange(1, 1, 1, Math.max(lc, NUM_COLS)).getValues()[0];
      Logger.log('🏷️ 헤더 (1행): ' + header.join(' | '));
      Logger.log('   ※ I열="삭제여부", J열="삭제한 사람" 이어야 함');
    }

    if (lr > 1) {
      var firstRow = ks.getRange(2, 1, 1, NUM_COLS).getValues()[0];
      Logger.log('📝 2행 샘플: ' + firstRow.join(' | '));
    }

    // 삭제된 행 카운트
    if (lr > 1) {
      var allData = ks.getRange(2, 1, lr - 1, NUM_COLS).getValues();
      var deletedCount = allData.filter(function(r){ return String(r[8]).toUpperCase() === 'Y'; }).length;
      Logger.log('🗑️ 삭제 처리된 행: ' + deletedCount + '건 (전체 ' + allData.length + '건 중)');
    }

    Logger.log('✅ 진단 완료');
  } catch (err) {
    Logger.log('❌ 진단 실패: ' + err.toString());
  }
}

// ============================================================
// 테스트 함수: 더미 데이터로 sync 동작 검증 (10열, 삭제행 포함)
// ============================================================
function testSync() {
  var fakeRequest = {
    parameter: {},
    postData: {
      type: 'application/json',
      contents: JSON.stringify({
        action: 'sync',
        data: [
          ['테스트L1', '테스트L2', '테스트 KPI(활성)', '설명', '산식', '월간', '테스터', 'testSync 실행', '', ''],
          ['테스트L1', '테스트L2', '테스트 KPI(삭제됨)', '설명', '산식', '월간', '테스터', 'testSync 실행', 'Y', '홍길동']
        ]
      })
    }
  };
  var result = doPost(fakeRequest);
  Logger.log('testSync 결과: ' + result.getContent());
  Logger.log('→ 시트 2~3행 확인: 2행은 활성, 3행은 I열=Y, J열=홍길동');
}

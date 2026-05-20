// ============================================================
// SKT 고객여정 Dashboard — Google Apps Script (v2)
// ============================================================
// 이 스크립트를 구글시트의 [확장 프로그램 > Apps Script]에 붙여넣으세요.
// 기존 코드를 전부 삭제하고, 이 코드를 통째로 붙여넣으면 됩니다.
//
// 변경사항 (v3):
//   - getDataRange() → getRange(1,1,lastRow,8) 로 변경하여 빈 행 방지
//   - 빈 행 필터링 추가 (l1~l4 모두 비어있으면 제외)
//   - CORS 헤더 대응 추가
//   - 1행 가이드라인, 2행 헤더, 3행부터 데이터 구조 대응
//   - H열 'source' → 'channels' 로 변경 (채널 TouchPoint 태그)
//
// 배포 방법:
//   [배포] > [배포 관리] > 연필 아이콘 > 버전: 새 버전 > [배포]
//   (이미 배포한 적 있으면 "새 배포"가 아니라 "배포 관리"에서 업데이트)
//
// 연결된 웹 엔드포인트:
//   https://script.google.com/macros/s/AKfycbwY-ZSmquMDmWaY39m_-CeTauo5ZXKrkyt8taQCsc-32bFj0YG_AjUEgwKz7mF01D2nEg/exec
// ============================================================

// ── 설정 ──
const SPREADSHEET_ID = '1sD604FpRUbi8mkT00DJxK3ErujIyhaxYzL302nuD7_A';
const JOURNEY_TAB    = '고객여정 Manager';
const REVIEW_TAB     = '검토_요청';

// ── GET: 데이터 읽기 ──
function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // ────────────────────────────────────
    // 1) 여정 데이터 읽기 (빈 행 필터링)
    // ────────────────────────────────────
    const journeySheet = ss.getSheetByName(JOURNEY_TAB);
    const lastRowJ     = journeySheet.getLastRow();

    // 데이터가 없으면 빈 배열
    let journeyRows = [];
    if (lastRowJ > 2) {
      const journeyData = journeySheet.getRange(1, 1, lastRowJ, 8).getValues();

      journeyRows = journeyData
        .slice(2) // 1행(가이드라인) + 2행(헤더) 제외, 3행부터
        .filter(function(row) {
          // l1, l2Code, l2Name, l3Code, l3Name, l4Code, l4Name 중
          // 하나라도 값이 있는 행만 남김
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

    // ────────────────────────────────────
    // 2) 검토 요청 중 "대기" 상태만 읽기
    // ────────────────────────────────────
    const reviewSheet = ss.getSheetByName(REVIEW_TAB);
    const lastRowR    = reviewSheet.getLastRow();

    let pendingReviews = [];
    if (lastRowR > 2) {
      const reviewData = reviewSheet.getRange(1, 1, lastRowR, 14).getValues();

      pendingReviews = reviewData
        .slice(2) // 1행(가이드라인) + 2행(헤더) 제외, 3행부터
        .filter(function(row) {
          return String(row[12]).trim() === '대기'; // M열 = 처리 상태
        })
        .map(function(row) {
          return {
            reqId:     String(row[0]  || ''),
            reqType:   String(row[1]  || ''),  // 추가 / 수정 / 삭제
            l1:        String(row[2]  || ''),
            l2Code:    String(row[3]  || ''),
            l2Name:    String(row[4]  || ''),
            l3Code:    String(row[5]  || ''),
            l3Name:    String(row[6]  || ''),
            l4Code:    String(row[7]  || ''),
            l4Name:    String(row[8]  || ''),
            content:   String(row[9]  || ''),
            requester: String(row[10] || ''),
            reqDate:   String(row[11] || ''),
            status:    String(row[12] || ''),
            adminMemo: String(row[13] || '')
          };
        });
    }

    // ────────────────────────────────────
    // 3) JSON 응답 반환
    // ────────────────────────────────────
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

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── POST: 요청 접수 ──
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var ss   = SpreadsheetApp.openById(SPREADSHEET_ID);
    var reviewSheet = ss.getSheetByName(REVIEW_TAB);

    // ────────────────────────────────────
    // 요청 ID 자동 채번
    // ────────────────────────────────────
    var lastRow = reviewSheet.getLastRow();
    var nextNum = 1;
    if (lastRow > 1) {
      // 마지막 행부터 거슬러 올라가며 유효한 ID 찾기
      for (var i = lastRow; i >= 2; i--) {
        var cellVal = String(reviewSheet.getRange(i, 1).getValue());
        var match = cellVal.match(/REQ_(\d+)/);
        if (match) {
          nextNum = parseInt(match[1]) + 1;
          break;
        }
      }
    }
    var reqId = 'REQ_' + ('000' + nextNum).slice(-3);

    // ────────────────────────────────────
    // 요청 일시 (KST)
    // ────────────────────────────────────
    var now = Utilities.formatDate(
      new Date(),
      'Asia/Seoul',
      'yyyy-MM-dd HH:mm:ss'
    );

    // ────────────────────────────────────
    // 새 행 추가
    // ────────────────────────────────────
    var newRow = [
      reqId,                        // A: 요청 ID
      body.reqType   || '',         // B: 요청 유형 (추가/수정/삭제)
      body.l1        || '',         // C: L1 (고객 상태/의도)
      body.l2Code    || '',         // D: L2 Code
      body.l2Name    || '',         // E: L2 (핵심 액티비티)
      body.l3Code    || '',         // F: L3 Code
      body.l3Name    || '',         // G: L3 (상세 액티비티)
      body.l4Code    || '',         // H: L4 Code (수정/삭제 시)
      body.l4Name    || '',         // I: L4 (수정/삭제 시)
      body.content   || '',         // J: 요청 내용
      body.requester || '',         // K: 요청자 이름
      now,                          // L: 요청 일시
      '대기',                       // M: 처리 상태
      ''                            // N: 관리자 메모
    ];

    reviewSheet.appendRow(newRow);

    // 응답
    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        reqId: reqId,
        message: '요청이 접수되었습니다.'
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

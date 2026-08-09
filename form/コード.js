// --------------------------------------------------
// 【共通設定】紐付けたいスプレッドシートのURL
// --------------------------------------------------
const SS_URL = PropertiesService.getScriptProperties().getProperty("COMMON_SHEET_URL") || "";

// フォーム送信時に実行される関数
function onFormSubmit(e) {
  const ss = SpreadsheetApp.openByUrl(SS_URL);
  const masterSheet = ss.getSheetByName("イベントマスター");
  const applySheet = ss.getSheetByName("申し込み管理");
  
  // フォームの回答データを取得
  const itemResponses = e.response.getItemResponses();
  let formData = {};
  for (let i = 0; i < itemResponses.length; i++) {
    let itemResponse = itemResponses[i];
    formData[itemResponse.getItem().getTitle()] = itemResponse.getResponse();
  }
  
  let selectedEvent = formData["イベント名"];
  let eventName = "";
  let startDate = formData["開始日"]; 
  let endDate   = formData["終了日"] || startDate; 
  let location  = formData["会場"];   
  
  let brand        = formData["ブランド"] || ""; // 新規登録時に使用
  let description  = formData["イベント概要"] || "";
  
  // 申し込み情報（セクション3の項目）
  const applyName  = formData["受付名（先行/一般など）"] || formData["受付名"];
  const applyUrl   = formData["申込URL"] || "";
  
  // 日時データの整形関数
  const formatDateTime = (dateTimeStr) => {
    if (!dateTimeStr) return "";
    return Utilities.formatDate(new Date(dateTimeStr), "JST", "yyyy-MM-dd HH:mm");
  };
  
  // 各日付・日時を整形
  const applyStartDate = formatDateTime(formData["申込開始日"]);
  const applyEndDate   = formatDateTime(formData["申込締切日"]);
  const resultDate     = formatDateTime(formData["当落発表日"]);
  const payDate        = formatDateTime(formData["入金締め切り日"]);
  
  const masterData = masterSheet.getDataRange().getValues();
  let eventId = "";
  let isExist = false;
  
  // --------------------------------------------------
  // A. 新規登録が選ばれた場合
  // --------------------------------------------------
  if (selectedEvent === "【新規登録】新しいイベントを入力する") {
    eventName = formData["新規イベント名（新しいイベントの場合のみ入力）"] || "未入力の新規イベント";
    
    // マスターに既に同じものがないか念のためチェック
    for (let i = 1; i < masterData.length; i++) {
      if (!masterData[i][3]) continue; 
      let sheetDate = Utilities.formatDate(new Date(masterData[i][3]), "JST", "yyyy-MM-dd");
      if (masterData[i][2] === eventName && sheetDate === startDate) { 
        isExist = true;
        eventId = masterData[i][0];
        brand = masterData[i][1]; // 既存のものがあればそのブランドを使う
        break;
      }
    }
    
    // 完全に新しいイベントならマスターに追記
    if (!isExist) {
      let lastRow = masterSheet.getLastRow();
      let newIdNum = lastRow === 1 ? 1 : parseInt(masterData[lastRow-1][0].split("-")[1]) + 1;
      eventId = "EV-" + String(newIdNum).padStart(3, '0');
      
      let nextMasterRow = lastRow + 1;
      let masterIfsFormula = `=IFS(
        TODAY() < DATE(YEAR(D${nextMasterRow}), MONTH(D${nextMasterRow}), DAY(D${nextMasterRow})), "開催前",
        AND(TODAY() >= DATE(YEAR(D${nextMasterRow}), MONTH(D${nextMasterRow}), DAY(D${nextMasterRow})), TODAY() <= DATE(YEAR(E${nextMasterRow}), MONTH(E${nextMasterRow}), DAY(E${nextMasterRow}))), "開催期間",
        TODAY() > DATE(YEAR(E${nextMasterRow}), MONTH(E${nextMasterRow}), DAY(E${nextMasterRow})), "開催終了"
      )`;
      
      masterSheet.appendRow([eventId, brand, eventName, startDate, endDate, location, description, "", masterIfsFormula]);
    }
    
  // --------------------------------------------------
  // B. 既存のイベントが選ばれた場合
  // --------------------------------------------------
  } else {
    Logger.log("【DEBUG】selectedEvent = " + selectedEvent);

    const match = selectedEvent.match(/^(.+)\s\(([^)]+)\)$/);
    if (match) {
      eventName = match[1];
      // "2026-11-28~11-29" のような複数日形式の場合は先頭の日付だけを使う
      startDate = match[2].split("~")[0].trim();
    } else {
      eventName = selectedEvent;
    }

    // マスターから一致する行を探して、イベントIDとブランドを取得
    for (let i = 1; i < masterData.length; i++) {
      if (!masterData[i][3]) continue;
      let sheetDate = Utilities.formatDate(new Date(masterData[i][3]), "JST", "yyyy-MM-dd");
      let mBrand = masterData[i][1] || "";
      let mName  = masterData[i][2] || "";
      let mDisplayName = mBrand ? "【" + mBrand + "】" + mName : mName;

      if ((mName === eventName || mDisplayName === eventName) && sheetDate === startDate) {
        eventId = masterData[i][0];
        brand = mBrand;
        eventName = mName; // 純粋なイベント名のみD列に書き込む
        break;
      }
    }

    if (!eventId) {
      Logger.log("【DEBUG】マッチ失敗: eventId が取得できませんでした");
    }
  }

  
  // --------------------------------------------------
  // 2. 申し込み管理シートの処理（共通）
  // --------------------------------------------------
  let applyLastRow = applySheet.getLastRow();
  let applyData = applySheet.getDataRange().getValues();
  let newApplyIdNum = applyLastRow === 1 ? 1 : parseInt(applyData[applyLastRow-1][0].split("-")[1]) + 1;
  let applyId = "AP-" + String(newApplyIdNum).padStart(3, '0');
  
  let nextRow = applyLastRow + 1;
  // K列に合わせたIFS数式を作成（申込開始:F列, 申込締切:G列, 当落発表:I列, 入金締切:J列）
  // 【修正ポイント】J--${nextRow} のタイポを修正
  let ifsFormula = `=IFS(
    TODAY() < DATE(YEAR(F${nextRow}), MONTH(F${nextRow}), DAY(F${nextRow})), "開始前",
    AND(TODAY() >= DATE(YEAR(F${nextRow}), MONTH(F${nextRow}), DAY(F${nextRow})), TODAY() <= DATE(YEAR(G${nextRow}), MONTH(G${nextRow}), DAY(G${nextRow}))), "受付期間",
    AND(TODAY() > DATE(YEAR(G${nextRow}), MONTH(G${nextRow}), DAY(G${nextRow})), TODAY() < DATE(YEAR(I${nextRow}), MONTH(I${nextRow}), DAY(I${nextRow}))), "抽選終了・当落確認前",
    AND(TODAY() >= DATE(YEAR(I${nextRow}), MONTH(I${nextRow}), DAY(I${nextRow})), TODAY() <= DATE(YEAR(J${nextRow}), MONTH(J${nextRow}), DAY(J${nextRow}))), "当落確認・入金期間",
    TODAY() > DATE(YEAR(J${nextRow}), MONTH(J${nextRow}), DAY(J${nextRow})), "期間終了"
  )`;

  // 申し込み管理シートへの書き込み
  applySheet.appendRow([
    applyId, 
    eventId, 
    brand, 
    eventName, 
    applyName, 
    applyStartDate, 
    applyEndDate, 
    applyUrl,
    resultDate,
    payDate,
    ifsFormula
  ]);
  
  // Discord通知
  notifyDiscordNewApply(applyId, eventId, brand, eventName, applyName, applyEndDate, payDate, applyUrl);

  // 最後にフォームのプルダウン選択肢を最新に更新
  updateFormOptions();
}

// --------------------------------------------------
// スプレッドシートから情報を取得し、フォームの選択肢を更新する関数（ブランド付与版）
// --------------------------------------------------
function updateFormOptions() {
  const ss = SpreadsheetApp.openByUrl(SS_URL);
  const masterSheet = ss.getSheetByName("イベントマスター");
  const masterData = masterSheet.getDataRange().getValues();
  
  let today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let eventOptions = [];
  for (let i = 1; i < masterData.length; i++) {
    let brand        = masterData[i][1]; // ブランドはB列(インデックス1)
    let name         = masterData[i][2]; // イベント名はC列(インデックス2)
    let rawStartDate = masterData[i][3]; // 開始日はD列(インデックス3)
    let rawEndDate   = masterData[i][4]; // 終了日はE列(インデックス4)
    
    // 判定基準：終了日（無ければ開始日）が今日以降であれば選択肢に残す
    let rawCompareDate = rawEndDate || rawStartDate;
    
    if (name && rawCompareDate) {
      let compareDate = new Date(rawCompareDate);
      compareDate.setHours(0, 0, 0, 0);
      
      if (compareDate >= today) {
        let startStr = Utilities.formatDate(new Date(rawStartDate), "JST", "yyyy-MM-dd");
        
        // ブランド名がある場合は「【ブランド】イベント名」、ない場合は「イベント名」にする
        let displayName = brand ? "【" + brand + "】" + name : name;
        
        if (rawEndDate && startStr !== Utilities.formatDate(new Date(rawEndDate), "JST", "yyyy-MM-dd")) {
          // 2日以上ある場合は「【ブランド】イベント名 (開始日~終了日)」にする
          let endStr = Utilities.formatDate(new Date(rawEndDate), "JST", "MM-dd");
          eventOptions.push(displayName + " (" + startStr + "~" + endStr + ")");
        } else {
          // 1日だけの場合は「【ブランド】イベント名 (開始日)」
          eventOptions.push(displayName + " (" + startStr + ")");
        }
      }
    }
  }
  
  eventOptions = Array.from(new Set(eventOptions));
  eventOptions.push("【新規登録】新しいイベントを入力する");
  
  const form = FormApp.getActiveForm();
  const items = form.getItems();
  
  let formSections = form.getItems(FormApp.ItemType.PAGE_BREAK);
  if (formSections.length < 2) return;
  let applySection = formSections[1].asPageBreakItem(); 
  
  for (let i = 0; i < items.length; i++) {
    if (items[i].getTitle() === "イベント名") {
      let itemType = items[i].getType();
      let choices = [];
      
      if (itemType === FormApp.ItemType.LIST) {
        let listItem = items[i].asListItem();
        for (let j = 0; j < eventOptions.length; j++) {
          if (eventOptions[j] === "【新規登録】新しいイベントを入力する") {
            choices.push(listItem.createChoice(eventOptions[j], FormApp.PageNavigationType.CONTINUE));
          } else {
            choices.push(listItem.createChoice(eventOptions[j], applySection));
          }
        }
        listItem.setChoices(choices);
      } else if (itemType === FormApp.ItemType.MULTIPLE_CHOICE) {
        let mcItem = items[i].asMultipleChoiceItem();
        for (let j = 0; j < eventOptions.length; j++) {
          if (eventOptions[j] === "【新規登録】新しいイベントを入力する") {
            choices.push(mcItem.createChoice(eventOptions[j], FormApp.PageNavigationType.CONTINUE));
          } else {
            choices.push(mcItem.createChoice(eventOptions[j], applySection));
          }
        }
        mcItem.setChoices(choices);
      }
    }
  }
}

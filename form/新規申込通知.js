// --------------------------------------------------
// Discord への新着申込通知
// --------------------------------------------------
/**
 * Discord へ新着申込を通知する
 * @param {string} applyId - 申し込みID
 * @param {string} eventId - イベントID
 * @param {string} brand - ブランド名
 * @param {string} eventName - イベント名
 * @param {string} applyName - 受付区分名
 * @param {string} applyEndDate - 申込締切日時文字列
 * @param {string} payDate - 入金締切日時文字列
 * @param {string} applyMethod - 申込方法
 */
function notifyDiscordNewApply(applyId, eventId, brand, eventName, applyName, applyEndDate, payDate, applyMethod) {
  const props        = PropertiesService.getScriptProperties();
  const WEBHOOK_URL  = props.getProperty("WEBHOOK_APPLY") || "";
  const PROXY_BASE   = props.getProperty("PROXY_BASE_URL") || "";

  const brandEventTitle = brand ? `【${brand}】${eventName}` : eventName;
  const webhookUrl = WEBHOOK_URL.replace("https://discord.com", PROXY_BASE);

  const lines = [
    "🆕 **新しいチケット申込が登録されたよ！**\n",
    `📅 **${brandEventTitle}**`,
    ` └ 受付区分: ${applyName || "未指定"}`,
  ];
  if (applyEndDate) lines.push(` └ 申込締切: **${applyEndDate}まで**`);
  if (payDate)      lines.push(` └ 入金締切: **${payDate}まで**`);
  if (applyMethod) {
    const trimmed = String(applyMethod).trim();
    if (trimmed.includes("\n")) {
      const quoted = trimmed.split("\n").map(l => `> ${l}`).join("\n");
      lines.push(` └ 申込方法:\n${quoted}`);
    } else {
      lines.push(` └ 申込方法: ${trimmed}`);
    }
  }

  try {
    UrlFetchApp.fetch(webhookUrl, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ content: lines.join("\n") }),
      muteHttpExceptions: true
    });
    Logger.log("Discord への新着申込通知を送信しました。");
  } catch (e) {
    Logger.log("Discord 通知の送信に失敗: " + e.toString());
  }
}

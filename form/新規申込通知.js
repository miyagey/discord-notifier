// --------------------------------------------------
// Discord への新着申込通知
// --------------------------------------------------
function notifyDiscordNewApply(applyId, eventId, brand, eventName, applyName, applyEndDate, payDate, applyUrl) {
  const props        = PropertiesService.getScriptProperties();
  const WEBHOOK_URL  = props.getProperty("WEBHOOK_APPLY") || "";
  const PROXY_BASE   = props.getProperty("PROXY_BASE_URL") || "";
  const FORM_URL     = props.getProperty("FORM_URL") || "";

  const brandEventTitle = brand ? `【${brand}】${eventName}` : eventName;
  const webhookUrl = WEBHOOK_URL.replace("https://discord.com", PROXY_BASE);

  const lines = [
    "🆕 **新しいチケット申込が登録されたよ！**\n",
    `📅 **${brandEventTitle}**`,
    ` └ 受付区分: ${applyName || "未指定"}`,
  ];
  if (applyEndDate) lines.push(` └ 申込締切: **${applyEndDate}まで**`);
  if (payDate)      lines.push(` └ 入金締切: **${payDate}まで**`);
  if (applyUrl)     lines.push(` └ 申込URL: ${applyUrl}`);
  lines.push("\n----------------------------------------");
  lines.push("📝 **イベント・申込の登録はこちら**");
  lines.push(`・【新形式 (フォーム)】: ${FORM_URL}`);
  lines.push(`・【旧形式 (スプレッドシート)】: ${SS_URL}`);

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

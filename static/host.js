"use strict";

const token = location.pathname.split("/").filter(Boolean)[1];
const errorEl = document.getElementById("error");
const publishBtn = document.getElementById("publish");

async function refresh() {
  let s;
  try {
    const r = await fetch("/api/h/" + token);
    const data = await r.json();
    if (!r.ok) {
      document.getElementById("content").hidden = true;
      const fatal = document.getElementById("fatal");
      fatal.hidden = false;
      fatal.textContent = data.error || "主持链接无效";
      return;
    }
    s = data;
  } catch {
    return; // 网络抖动，下次轮询再试
  }
  render(s);
}

function render(s) {
  document.getElementById("published-banner").hidden = !s.published;

  const pending = s.reviewers.filter((r) => !r.submitted).map((r) => r.name);
  const acked = s.reviewers.filter((r) => r.acknowledged).length;
  document.getElementById("pending-summary").textContent = s.published
    ? "互评已结束。已读回执：" + acked + "/" + s.reviewers.length + " 已确认。"
    : pending.length
      ? "待交人员：" + pending.join("、")
      : "全部已交，可以公布。";

  // 已读回执列仅公布后展示（按留存名单原顺序），不含意见或问答内容
  document.getElementById("ack-head").hidden = !s.published;
  document.getElementById("ack-note").hidden = !s.published;

  const tbody = document.getElementById("reviewers");
  tbody.innerHTML = "";
  for (const r of s.reviewers) {
    const tr = document.createElement("tr");
    const tdName = document.createElement("td");
    tdName.textContent = r.name;
    const tdStatus = document.createElement("td");
    tdStatus.textContent = r.submitted ? "已交" : "待交";
    tdStatus.className = r.submitted ? "ok" : "pending";
    tr.append(tdName, tdStatus);
    if (s.published) {
      const tdAck = document.createElement("td");
      tdAck.textContent = r.acknowledged
        ? "已确认（" + r.acknowledged_at + "）"
        : "待确认";
      tdAck.className = r.acknowledged ? "ok" : "pending";
      tr.appendChild(tdAck);
    }
    tbody.appendChild(tr);
  }

  publishBtn.disabled = !s.can_publish;

  renderReports(s.reports || []);

  const linksBody = document.getElementById("links");
  linksBody.innerHTML = "";
  for (const l of s.links) {
    const tr = document.createElement("tr");
    const tdName = document.createElement("td");
    tdName.textContent = l.name;
    const tdLink = document.createElement("td");
    const a = document.createElement("a");
    a.href = location.origin + l.url;
    a.textContent = location.origin + l.url;
    tdLink.appendChild(a);
    const tdAction = document.createElement("td");
    const rotateBtn = document.createElement("button");
    rotateBtn.type = "button";
    rotateBtn.className = "link";
    rotateBtn.textContent = "换发链接";
    rotateBtn.dataset.name = l.name;
    rotateBtn.dataset.link = location.origin + l.url;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "link-danger remove-member";
    removeBtn.textContent = "移除成员";
    removeBtn.dataset.name = l.name;
    // 公布后不可移除：按钮禁用
    removeBtn.disabled = !!s.published;
    tdAction.append(rotateBtn, removeBtn);
    tr.append(tdName, tdLink, tdAction);
    linksBody.appendChild(tr);
  }
}

// 本会话举报列表：只展示编号、原因、意见原文与处理状态；待处理的可裁定保留/屏蔽
function renderReports(reports) {
  const card = document.getElementById("reports-card");
  const tbody = document.getElementById("reports");
  tbody.innerHTML = "";
  card.hidden = reports.length === 0;
  const statusText = { pending: "待处理", kept: "已保留", hidden: "已屏蔽" };
  for (const r of reports) {
    const tr = document.createElement("tr");
    const tdId = document.createElement("td");
    tdId.textContent = "#" + r.id;
    const tdReason = document.createElement("td");
    tdReason.textContent = r.reason;
    const tdContent = document.createElement("td");
    tdContent.textContent = r.content;
    const tdStatus = document.createElement("td");
    tdStatus.textContent = statusText[r.status] || r.status;
    tdStatus.className = r.status === "pending" ? "pending" : "ok";
    const tdAction = document.createElement("td");
    if (r.status === "pending") {
      // 仅待处理可裁定；处理后不可更改
      for (const [action, label] of [["keep", "保留"], ["hide", "屏蔽"]]) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = action === "hide" ? "link-danger report-action" : "link report-action";
        btn.textContent = label;
        btn.dataset.id = r.id;
        btn.dataset.action = action;
        tdAction.appendChild(btn);
      }
    }
    tr.append(tdId, tdReason, tdContent, tdStatus, tdAction);
    tbody.appendChild(tr);
  }
}

// 主持人裁定一条待处理举报：保留或屏蔽，处理后不可更改
document.getElementById("reports").addEventListener("click", async (e) => {
  const btn = e.target.closest("button.report-action");
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  const reportError = document.getElementById("report-error");
  reportError.textContent = "";
  if (
    !confirm(
      action === "hide"
        ? `确定屏蔽举报 #${id} 对应的意见？\n屏蔽后该意见不再对作者展示（意见原文、问答与回执均保留），且处理后不可更改。`
        : `确定保留举报 #${id} 对应的意见？\n保留后该意见继续对作者展示，且处理后不可更改。`
    )
  )
    return;
  btn.disabled = true;
  try {
    const r = await fetch("/api/h/" + token + "/reports/" + id, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await r.json();
    if (!r.ok) {
      reportError.textContent =
        "处理举报 #" + id + " 失败：" + (data.error || "请刷新主持台后重试");
    }
  } catch {
    reportError.textContent = "网络错误，请重试";
  }
  refresh();
});

publishBtn.addEventListener("click", async () => {
  if (!confirm("确定公布？公布后稿件与意见均不可再修改。")) return;
  errorEl.textContent = "";
  try {
    const r = await fetch("/api/h/" + token + "/publish", { method: "POST" });
    const data = await r.json();
    if (!r.ok) {
      errorEl.textContent =
        (data.error || "公布失败") +
        (data.missing ? "（缺：" + data.missing.join("、") + "）" : "");
    }
  } catch {
    errorEl.textContent = "网络错误，请重试";
  }
  refresh();
});

// 换发某人的个人链接：请求携带姓名与页面所见链接，成功后原链接立即作废
document.getElementById("links").addEventListener("click", async (e) => {
  const btn = e.target.closest("button.link");
  if (!btn) return;
  const name = btn.dataset.name;
  const link = btn.dataset.link;
  const rotateError = document.getElementById("rotate-error");
  rotateError.textContent = "";
  if (
    !confirm(
      `确定为「${name}」换发链接？\n` +
        "原链接将立即作废，之后再使用原链接读取或提交一律无效；" +
        "新链接仍沿用其稿件、版本、分配、意见与问答，其他人不受影响。"
    )
  )
    return;
  btn.disabled = true;
  try {
    const r = await fetch("/api/h/" + token + "/rotate-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, link }),
    });
    const data = await r.json();
    if (!r.ok) {
      rotateError.textContent =
        "换发「" + name + "」失败：" + (data.error || "请刷新主持台后重试");
      return;
    }
    alert(
      "「" + name + "」的新个人链接：\n" + location.origin + data.url +
      "\n原链接已作废，请尽快把新链接分发给本人。"
    );
  } catch {
    rotateError.textContent = "网络错误，请重试";
  }
  refresh();
});

// 公布前移除一名退出互评的成员：名单、分配与意见一起生效，不支持补人或恢复
document.getElementById("links").addEventListener("click", async (e) => {
  const btn = e.target.closest("button.remove-member");
  if (!btn) return;
  const name = btn.dataset.name;
  const removeError = document.getElementById("remove-error");
  removeError.textContent = "";
  if (
    !confirm(
      `确定移除「${name}」？\n` +
        "移除后名单立即按原录入顺序重新闭合互评环（至少保留 3 人），不能补人也不能恢复：\n" +
        "· 「" + name + "」的个人链接永久失效，其发出或收到的意见不计入公布条件；\n" +
        "· 只有原来评「" + name + "」的人会改评下一位留存成员，其旧意见失效、需重新阅读提交；\n" +
        "· 其他人的稿件、版本、意见与链接全部保留。"
    )
  )
    return;
  btn.disabled = true;
  try {
    const r = await fetch("/api/h/" + token + "/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await r.json();
    if (!r.ok) {
      removeError.textContent =
        "移除「" + name + "」失败：" + (data.error || "请刷新主持台后重试");
    }
  } catch {
    removeError.textContent = "网络错误，请重试";
  }
  refresh();
});

refresh();
setInterval(refresh, 3000);

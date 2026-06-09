/**
 * 中文游戏发售日历 — 前端交互逻辑
 * 根据用户选择的平台动态生成日历订阅 URL
 */

// ============================================================
// 配置
// ============================================================

/** Workers 后端地址（部署后替换为实际域名） */
const WORKER_HOST = "https://game-calendar-cn.342433419.workers.dev";

// ============================================================
// DOM 元素
// ============================================================

const form = document.getElementById('calendar-form');
const urlInput = document.getElementById('calendar-url');
const copyBtn = document.getElementById('copy-btn');
const copyToast = document.getElementById('copy-toast');

// ============================================================
// 核心逻辑
// ============================================================

/**
 * 根据表单状态更新日历 URL 和按钮状态
 */
function updateCalendarUrl() {
  const formData = new FormData(form);
  const platforms = formData.getAll('platform');

  if (platforms.length === 0) {
    urlInput.value = '';
    urlInput.placeholder = '请先选择至少一个平台';
    copyBtn.disabled = true;
    return;
  }

  // 拼接查询参数
  const params = new URLSearchParams();
  for (const p of platforms) {
    params.append('platform', String(p));
  }

  const url = `${WORKER_HOST}/calendar?${params.toString()}`;
  urlInput.value = url;
  urlInput.placeholder = '';
  copyBtn.disabled = false;
}

/**
 * 复制 URL 到剪贴板
 */
async function copyToClipboard() {
  const url = urlInput.value;
  if (!url) return;

  try {
    await navigator.clipboard.writeText(url);
    showToast();
  } catch {
    // 降级方案：选中文本并执行复制命令
    urlInput.select();
    document.execCommand('copy');
    showToast();
  }
}

/**
 * 显示复制成功提示
 */
function showToast() {
  copyToast.classList.add('show');
  const copyText = copyBtn.querySelector('.copy-text');
  if (copyText) copyText.textContent = '已复制';

  setTimeout(() => {
    copyToast.classList.remove('show');
    if (copyText) copyText.textContent = '复制';
  }, 2000);
}

// ============================================================
// 事件绑定
// ============================================================

form.addEventListener('change', updateCalendarUrl);
copyBtn.addEventListener('click', copyToClipboard);

// 初始化
updateCalendarUrl();

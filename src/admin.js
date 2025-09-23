import './style.css';

// 管理页：编辑“前端可见”的模型/声音列表，存储到 localStorage
const KEYS = {
  llm: 'visible_llm_models',
  asr: 'visible_asr_models',
  tts: 'visible_tts_voices',
  vrm: 'visible_voice_models'
};

function readEnvList(key, fallback) {
  try {
    const raw = (import.meta?.env && import.meta.env[key]) || '';
    if (!raw) return fallback;
    if (raw.trim().startsWith('[')) return JSON.parse(raw);
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  } catch (e) {
    return fallback;
  }
}

function getDefaults() {
  return {
    llm: readEnvList('VITE_LLM_MODELS', []),
    asr: readEnvList('VITE_ASR_MODELS', []),
    tts: readEnvList('VITE_TTS_VOICES', []),
    vrm: readEnvList('VITE_VOICE_MODELS', [])
  };
}

function getVisible() {
  const d = getDefaults();
  const parse = (k, def) => {
    try {
      const raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : def;
    } catch {
      return def;
    }
  };
  return {
    llm: parse(KEYS.llm, d.llm),
    asr: parse(KEYS.asr, d.asr),
    tts: parse(KEYS.tts, d.tts),
    vrm: parse(KEYS.vrm, d.vrm)
  };
}

function renderList(title, key, defaults, selected) {
  const items = [...new Set([...defaults, ...selected])];
  const checked = new Set(selected);
  const rows = items
    .map((v) => {
      const id = `${key}-${btoa(v).replace(/=/g, '')}`;
      return `<label style="display:flex;gap:8px;align-items:center;">
        <input type="checkbox" id="${id}" data-key="${key}" data-value="${v}" ${checked.has(v) ? 'checked' : ''} />
        <span>${v}</span>
      </label>`;
    })
    .join('');
  return `<div class="model-item" style="flex-direction:column; align-items:flex-start; gap:8px;">
    <div class="model-name">${title}</div>
    ${rows}
  </div>`;
}

function render() {
  const root = document.getElementById('adminRoot');
  const d = getDefaults();
  const v = getVisible();
  root.innerHTML = `
    ${renderList('文本 LLM', KEYS.llm, d.llm, v.llm)}
    ${renderList('ASR（语音识别）', KEYS.asr, d.asr, v.asr)}
    ${renderList('TTS 声音', KEYS.tts, d.tts, v.tts)}
    ${renderList('语音大模型', KEYS.vrm, d.vrm, v.vrm)}
    <div class="form-actions">
      <button id="btn-save-admin" class="btn">保存可见列表</button>
      <button id="btn-reset-admin" class="btn btn-secondary">恢复为默认</button>
    </div>
  `;

  document.getElementById('btn-save-admin')?.addEventListener('click', () => {
    const checks = Array.from(document.querySelectorAll('input[type="checkbox"][data-key]'));
    const grouped = { [KEYS.llm]: [], [KEYS.asr]: [], [KEYS.tts]: [], [KEYS.vrm]: [] };
    checks.forEach((el) => {
      if (el.checked) grouped[el.dataset.key].push(el.dataset.value);
    });
    Object.entries(grouped).forEach(([k, arr]) => localStorage.setItem(k, JSON.stringify(arr)));
    alert('已保存');
  });

  document.getElementById('btn-reset-admin')?.addEventListener('click', () => {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
    render();
  });

  // 保存本地直连配置
  const devEnabled = document.getElementById('devEnabled');
  const devBase = document.getElementById('devBase');
  const devKey = document.getElementById('devKey');
  // 端点自定义
  const epAsr = document.createElement('input');
  const epTts = document.createElement('input');
  const epVrm = document.createElement('input');
  epAsr.placeholder = 'ASR 模型列表接口（可选）';
  epTts.placeholder = 'TTS 声音列表接口（可选）';
  epVrm.placeholder = '语音大模型列表接口（可选）';

  const savedEnabled = localStorage.getItem('dev_enabled');
  const savedBase = localStorage.getItem('dev_llm_base');
  const savedKey = localStorage.getItem('dev_api_key');
  if (savedEnabled !== null) devEnabled.checked = savedEnabled === 'true';
  if (savedBase) devBase.value = savedBase;
  if (savedKey) devKey.value = savedKey;
  document.getElementById('btn-save-dev')?.addEventListener('click', () => {
    localStorage.setItem('dev_enabled', devEnabled.checked ? 'true' : 'false');
    localStorage.setItem('dev_llm_base', devBase.value.trim());
    localStorage.setItem('dev_api_key', devKey.value.trim());
    alert('已保存开发配置');
  });
}

render();



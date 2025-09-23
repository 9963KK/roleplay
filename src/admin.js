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
  // 每个分区顶部带“获取模型”按钮
  // 每个分区包含：提供商配置 + 获取模型 + 列表
  const cfg = {
    [KEYS.llm]: { baseKey: 'dev_llm_base', keyKey: 'dev_api_key', placeholder: ['https://api.openai.com/v1', 'sk-...'] },
    [KEYS.asr]: { baseKey: 'dev_asr_base', keyKey: 'dev_asr_key', placeholder: ['wss://provider.com/asr 或 https://api.asr.com/v1', 'asr-密钥'] },
    [KEYS.tts]: { baseKey: 'dev_tts_base', keyKey: 'dev_tts_key', placeholder: ['https://tts.example.com', 'tts-密钥'] },
    [KEYS.vrm]: { baseKey: 'dev_vrm_base', keyKey: 'dev_vrm_key', placeholder: ['https://voice.example.com', 'voice-密钥'] }
  }[key];

  const baseVal = localStorage.getItem(cfg.baseKey) || '';
  const keyVal = localStorage.getItem(cfg.keyKey) || '';

  return `<div class="model-item" style="flex-direction:column; align-items:flex-start; gap:10px;">
    <div class="model-name">${title}</div>
    <label class="admin-row"><span class="admin-label">Base</span><input class="admin-input" id="${cfg.baseKey}" value="${baseVal}" placeholder="${cfg.placeholder[0]}" /></label>
    <label class="admin-row"><span class="admin-label">API Key</span><input class="admin-input" id="${cfg.keyKey}" value="${keyVal}" placeholder="${cfg.placeholder[1]}" /></label>
    <div style="display:flex; gap:8px;">
      <button data-fetch-key="${key}" class="btn btn-small">获取模型</button>
      <button data-save-cred="${key}" class="btn btn-small btn-secondary">保存此服务凭据</button>
    </div>
    ${rows}
  </div>`;
}

function render() {
  const root = document.getElementById('adminRoot');
  const d = getDefaults();
  const v = getVisible();
  // 若默认与本地均为空，则不渲染任何项（避免显示默认模型）
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
  // 统一改为按服务分区的控件（在列表区里生成，所以从 localStorage 读取/保存，不再在此处引用）
  // 端点自定义
  const epAsr = document.createElement('input');
  const epTts = document.createElement('input');
  const epVrm = document.createElement('input');
  epAsr.placeholder = 'ASR 模型列表接口（可选）';
  epTts.placeholder = 'TTS 声音列表接口（可选）';
  epVrm.placeholder = '语音大模型列表接口（可选）';

  const savedEnabled = localStorage.getItem('dev_enabled');
  if (savedEnabled !== null) devEnabled.checked = savedEnabled === 'true';
  document.getElementById('btn-save-dev')?.addEventListener('click', () => {
    localStorage.setItem('dev_enabled', devEnabled.checked ? 'true' : 'false');
    alert('已保存开发配置');
  });

  // 一键获取模型：基于 dev 配置从各端点拉取并填充
  const doFetchFor = async (serviceKey) => {
    // 映射每个服务对应的输入 ID 与端点
    const map = {
      [KEYS.llm]: {
        baseId: 'dev_llm_base', keyId: 'dev_api_key', endpoint: appConfig?.dev?.modelsEndpoint || '/models'
      },
      [KEYS.asr]: {
        baseId: 'dev_asr_base', keyId: 'dev_asr_key', endpoint: appConfig?.dev?.asrModelsEndpoint || ''
      },
      [KEYS.tts]: {
        baseId: 'dev_tts_base', keyId: 'dev_tts_key', endpoint: appConfig?.dev?.ttsVoicesEndpoint || ''
      },
      [KEYS.vrm]: {
        baseId: 'dev_vrm_base', keyId: 'dev_vrm_key', endpoint: appConfig?.dev?.voiceModelsEndpoint || ''
      }
    }[serviceKey];

    if (!map) return;

    const base = (document.getElementById(map.baseId)?.value || localStorage.getItem(map.baseId) || '').trim();
    const key = (document.getElementById(map.keyId)?.value || localStorage.getItem(map.keyId) || '').trim();
    if (!base || !key) return alert('请先填写该服务的 Base 与 API Key');

    const authHeader = appConfig?.dev?.authHeader || 'Authorization';
    const authScheme = appConfig?.dev?.authScheme || 'Bearer';
    const modelsEp = map.endpoint; // 对应服务端点
    const fetchList = async (url) => {
      if (!url) return [];
      try {
        const r = await fetch(url, { headers: { [authHeader]: `${authScheme} ${key}` } });
        const j = await r.json();
        if (Array.isArray(j?.data)) return j.data.map((x) => x.id || x.name).filter(Boolean);
        return j?.items || j?.models || [];
      } catch { return []; }
    };

    const llm = serviceKey === KEYS.llm ? await fetchList(`${base}${modelsEp}`) : [];
    const asr = serviceKey === KEYS.asr ? await fetchList(modelsEp ? `${base}${modelsEp}` : '') : [];
    const tts = serviceKey === KEYS.tts ? await fetchList(modelsEp ? `${base}${modelsEp}` : '') : [];
    const vrm = serviceKey === KEYS.vrm ? await fetchList(modelsEp ? `${base}${modelsEp}` : '') : [];

    if (llm.length) localStorage.setItem(KEYS.llm, JSON.stringify(llm));
    if (asr.length) localStorage.setItem(KEYS.asr, JSON.stringify(asr));
    if (tts.length) localStorage.setItem(KEYS.tts, JSON.stringify(tts));
    if (vrm.length) localStorage.setItem(KEYS.vrm, JSON.stringify(vrm));
    if (llm.length || asr.length || tts.length || vrm.length) {
      alert('已更新');
      render();
    }
  };

  document.querySelectorAll('[data-fetch-key]')?.forEach((btn) => {
    btn.addEventListener('click', () => doFetchFor(btn.getAttribute('data-fetch-key')));
  });

  // 保存各分区凭据
  document.querySelectorAll('[data-save-cred]')?.forEach((btn) => {
    btn.addEventListener('click', () => {
      const service = btn.getAttribute('data-save-cred');
      const map = {
        [KEYS.llm]: { baseKey: 'dev_llm_base', keyKey: 'dev_api_key' },
        [KEYS.asr]: { baseKey: 'dev_asr_base', keyKey: 'dev_asr_key' },
        [KEYS.tts]: { baseKey: 'dev_tts_base', keyKey: 'dev_tts_key' },
        [KEYS.vrm]: { baseKey: 'dev_vrm_base', keyKey: 'dev_vrm_key' }
      }[service];
      if (!map) return;
      const baseInput = document.getElementById(map.baseKey);
      const keyInput = document.getElementById(map.keyKey);
      localStorage.setItem(map.baseKey, baseInput?.value.trim() || '');
      localStorage.setItem(map.keyKey, keyInput?.value.trim() || '');
      alert('已保存该服务的凭据');
    });
  });
}

render();



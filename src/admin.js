import './style.css';
import { defaultCharacters } from './shared/defaultCharacters.js';

const CHARACTER_STORAGE_KEY = 'app_characters';

// 运行时配置（admin 页面也需要加载 app-config.json）
let appConfig = { dev: {} };
function loadAppConfig() {
  return fetch('/app-config.json', { cache: 'no-store' })
    .then((r) => r.json())
    .then((cfg) => {
      appConfig = cfg || { dev: {} };
      return appConfig;
    })
    .catch(() => (appConfig = { dev: {} }));
}

const PROMPT_STORAGE_KEY = 'admin_character_prompts';

const AVAILABLE_KEYS = {
  llm: 'candidate_llm_models',
  asr: 'candidate_asr_models',
  tts: 'candidate_tts_voices',
  vrm: 'candidate_voice_models'
};

function cloneCharacters(list) {
  return list.map((char) => ({ ...char }));
}

function loadCharacterList() {
  try {
    const raw = localStorage.getItem(CHARACTER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map((item, idx) => ({
          id: item?.id ?? Date.now() + idx,
          name: item?.name || `角色${idx + 1}`,
          icon: item?.icon || '🧑',
          description: item?.description || '',
          personality: item?.personality || '',
          background: item?.background || '',
          responseFormat: item?.responseFormat || ''
        }));
      }
    }
  } catch {
    // ignore
  }
  return cloneCharacters(defaultCharacters);
}

function persistCharacterPrompts(map) {
  localStorage.setItem(PROMPT_STORAGE_KEY, JSON.stringify(map));
}

function loadCharacterPrompts() {
  try {
    const raw = localStorage.getItem(PROMPT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const converted = parsed.reduce((acc, item) => {
        if (!item) return acc;
        const key = item.id ?? item.name;
        if (!key) return acc;
        acc[key] = { prompt: item.prompt || '', name: item.name || '' };
        return acc;
      }, {});
      persistCharacterPrompts(converted);
      return converted;
    }
    if (parsed && typeof parsed === 'object') return parsed;
    return {};
  } catch {
    return {};
  }
}

let promptCache = loadCharacterPrompts();

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

function getAvailable() {
  const parse = (key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  };
  return {
    llm: parse(AVAILABLE_KEYS.llm),
    asr: parse(AVAILABLE_KEYS.asr),
    tts: parse(AVAILABLE_KEYS.tts),
    vrm: parse(AVAILABLE_KEYS.vrm)
  };
}

function setAvailable(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // ignore
  }
}

const PREFERRED_ARRAY_KEYS = ['data', 'items', 'models', 'list', 'result', 'results', 'entries'];
const MODEL_ID_KEYS = ['id', 'model', 'name', 'slug', 'code', 'uid', 'value', 'key', 'identifier'];

function findArrayCandidate(payload, depth = 0, visited = new Set()) {
  if (!payload || depth > 4) return [];
  if (Array.isArray(payload)) return payload;
  if (typeof payload !== 'object') return [];
  if (visited.has(payload)) return [];
  visited.add(payload);

  for (const key of PREFERRED_ARRAY_KEYS) {
    const direct = payload[key];
    if (Array.isArray(direct)) return direct;
  }

  for (const key of PREFERRED_ARRAY_KEYS) {
    const nested = payload[key];
    if (nested && typeof nested === 'object') {
      const arr = findArrayCandidate(nested, depth + 1, visited);
      if (arr.length) return arr;
    }
  }

  for (const value of Object.values(payload)) {
    if (!value || typeof value !== 'object') continue;
    const arr = findArrayCandidate(value, depth + 1, visited);
    if (arr.length) return arr;
  }

  const keys = Object.keys(payload || {});
  if (keys.length && keys.every((key) => typeof key === 'string')) {
    return keys;
  }
  return [];
}

function pickModelIdentifier(entry, depth = 0) {
  if (entry === null || entry === undefined) return '';
  if (typeof entry === 'string') return entry.trim();
  if (typeof entry === 'number') return String(entry);
  if (depth > 3 || typeof entry !== 'object') return '';

  for (const key of MODEL_ID_KEYS) {
    const value = entry[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }

  for (const value of Object.values(entry)) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  for (const value of Object.values(entry)) {
    if (!value || typeof value !== 'object') continue;
    const nested = pickModelIdentifier(value, depth + 1);
    if (nested) return nested;
  }
  return '';
}

function setButtonLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    if (!btn.dataset.label) btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('loading');
    btn.innerHTML = '<span class="spinner"></span>获取中…';
  } else {
    btn.disabled = false;
    btn.classList.remove('loading');
    if (btn.dataset.label) {
      btn.innerHTML = btn.dataset.label;
      delete btn.dataset.label;
    }
  }
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

function renderList(title, key, defaults, selected, available) {
  const candidate = Array.isArray(available) ? available : [];
  const items = [...new Set([...defaults, ...candidate, ...selected])];
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
    <div class="admin-row" style="justify-content:space-between; gap:8px;">
      <div style="display:flex; gap:8px;">
        <button data-fetch-key="${key}" class="btn btn-small">获取模型</button>
        <button data-save-cred="${key}" class="btn btn-small btn-secondary">保存此服务凭据</button>
        <button data-select-all="${key}" class="btn btn-small btn-secondary">全选</button>
        <button data-select-none="${key}" class="btn btn-small btn-secondary">不选</button>
      </div>
      <input class="admin-input" data-search="${key}" placeholder="搜索模型…" style="max-width:320px;" />
    </div>
    <div class="model-list-items" data-list-key="${key}">
      ${rows}
    </div>
  </div>`;
}

function render() {
  promptCache = loadCharacterPrompts();
  const characters = loadCharacterList();
  const root = document.getElementById('adminRoot');
  const d = getDefaults();
  const v = getVisible();
  const a = getAvailable();
  // 若默认与本地均为空，则不渲染任何项（避免显示默认模型）
  root.innerHTML = `
    <div class="form-actions model-save-actions">
      <button id="btn-save-admin" class="btn">保存可见列表</button>
      <button id="btn-reset-admin" class="btn btn-secondary">恢复为默认</button>
    </div>
    ${renderList('文本 LLM', KEYS.llm, d.llm, v.llm, a.llm)}
    ${renderList('ASR（语音识别）', KEYS.asr, d.asr, v.asr, a.asr)}
    ${renderList('TTS 声音', KEYS.tts, d.tts, v.tts, a.tts)}
    ${renderList('语音大模型', KEYS.vrm, d.vrm, v.vrm, a.vrm)}
    <div class="settings-header" style="margin-top:32px;">
      <h2>角色系统提示词</h2>
    </div>
    <div id="promptList" class="prompt-list" style="display:flex;flex-direction:column;gap:16px;"></div>
    <div class="form-actions">
      <button id="btn-save-prompts" class="btn">保存提示词</button>
      <button id="btn-reset-prompts" class="btn btn-secondary">清空全部</button>
    </div>
  `;

  const renderPromptList = () => {
    const list = document.getElementById('promptList');
    if (!list) return;
    if (!characters.length) {
      list.innerHTML = '<div style="color:#6b7280;">暂未检测到角色，请先在前端创建人物。</div>';
      return;
    }
    list.innerHTML = characters
      .map((char) => {
        const entry = promptCache[char.id] ?? promptCache[`${char.id}`] ?? promptCache[char.name] ?? {};
        const promptValue = typeof entry === 'string' ? entry : (entry?.prompt || '');
        const metaPieces = [char.description, char.personality].filter(Boolean);
        const meta = metaPieces.length ? metaPieces.join('｜') : '';
        return `
        <div class="model-item" data-id="${char.id}" style="flex-direction:column; align-items:flex-start; gap:10px;">
          <div style="display:flex; gap:12px; align-items:center;">
            <div style="width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;background:var(--badge-bg);">${char.icon || '🧑'}</div>
            <div>
              <div class="model-name">${char.name}</div>
              ${meta ? `<div style="font-size:12px;color:#6b7280;">${meta}</div>` : ''}
            </div>
          </div>
          <label class="admin-row" style="align-items:flex-start;">
            <span class="admin-label" style="min-width:84px; margin-top:4px;">系统提示词</span>
            <textarea class="admin-input" data-character-id="${char.id}" style="min-height:120px;resize:vertical;" placeholder="填写该角色的系统提示词">${promptValue}</textarea>
          </label>
        </div>`;
      })
      .join('');
  };

  renderPromptList();

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
    Object.values(AVAILABLE_KEYS).forEach((k) => localStorage.removeItem(k));
    render();
  });

  document.getElementById('btn-save-prompts')?.addEventListener('click', () => {
    const inputs = Array.from(document.querySelectorAll('textarea[data-character-id]'));
    const nextMap = {};
    inputs.forEach((textarea) => {
      const id = textarea.getAttribute('data-character-id');
      if (!id) return;
      const value = textarea.value.trim();
      if (!value) return;
      const match = characters.find((char) => `${char.id}` === id);
      nextMap[id] = { prompt: value, name: match?.name || '' };
    });
    promptCache = nextMap;
    persistCharacterPrompts(promptCache);
    alert('已保存系统提示词');
  });

  document.getElementById('btn-reset-prompts')?.addEventListener('click', () => {
    if (!confirm('确定清空全部系统提示词吗？')) return;
    promptCache = {};
    localStorage.removeItem(PROMPT_STORAGE_KEY);
    renderPromptList();
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
  const doFetchFor = async (triggerBtn, serviceKey) => {
    setButtonLoading(triggerBtn, true);
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

    if (!map) {
      setButtonLoading(triggerBtn, false);
      return;
    }

    const base = (document.getElementById(map.baseId)?.value || localStorage.getItem(map.baseId) || '').trim();
    const key = (document.getElementById(map.keyId)?.value || localStorage.getItem(map.keyId) || '').trim();
    if (!base || !key) {
      alert('请先填写该服务的 Base 与 API Key');
      setButtonLoading(triggerBtn, false);
      return;
    }

    const authHeader = appConfig?.dev?.authHeader || 'Authorization';
    const authScheme = appConfig?.dev?.authScheme || 'Bearer';
    const modelsEp = map.endpoint; // 对应服务端点
    const fetchList = async (url) => {
      if (!url) {
        alert('未配置该服务的模型列表端点');
        return [];
      }
      try {
        const r = await fetch(url, { headers: { [authHeader]: `${authScheme} ${key}` } });
        if (!r.ok) {
          const text = await r.text().catch(() => '');
          alert(`获取失败（${r.status}）\n${text}`);
          return [];
        }
        const j = await r.json().catch(() => ({}));
        let arr = findArrayCandidate(j);
        if (!Array.isArray(arr) || !arr.length) arr = findArrayCandidate(j?.data);
        const idsSet = new Set();
        const appendIds = (list) => {
          if (!Array.isArray(list)) return;
          list.forEach((item) => {
            const id = pickModelIdentifier(item);
            if (id) idsSet.add(id);
          });
        };
        appendIds(arr);
        if (!idsSet.size && j && typeof j === 'object') {
          appendIds(Object.keys(j));
        }
        const ids = Array.from(idsSet);
        if (!ids.length) alert('已请求成功，但未能解析出模型名称（请确认响应中包含 id/name/model 等字段）。');
        return ids;
      } catch (e) {
        alert(`请求异常：${e?.message || e}`);
        return [];
      }
    };

    const llm = serviceKey === KEYS.llm ? await fetchList(`${base}${modelsEp}`) : [];
    const asr = serviceKey === KEYS.asr ? await fetchList(modelsEp ? `${base}${modelsEp}` : '') : [];
    const tts = serviceKey === KEYS.tts ? await fetchList(modelsEp ? `${base}${modelsEp}` : '') : [];
    const vrm = serviceKey === KEYS.vrm ? await fetchList(modelsEp ? `${base}${modelsEp}` : '') : [];

    if (llm.length) setAvailable(AVAILABLE_KEYS.llm, llm);
    if (asr.length) setAvailable(AVAILABLE_KEYS.asr, asr);
    if (tts.length) setAvailable(AVAILABLE_KEYS.tts, tts);
    if (vrm.length) setAvailable(AVAILABLE_KEYS.vrm, vrm);
    if (llm.length || asr.length || tts.length || vrm.length) {
      alert('已更新');
      setButtonLoading(triggerBtn, false);
      render();
      return;
    }
    setButtonLoading(triggerBtn, false);
  };

  document.querySelectorAll('[data-fetch-key]')?.forEach((btn) => {
    btn.addEventListener('click', () => doFetchFor(btn, btn.getAttribute('data-fetch-key')));
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

  // 全选/不选
  const setAll = (key, val) => {
    const box = document.querySelector(`[data-list-key="${key}"]`);
    if (!box) return;
    box.querySelectorAll('input[type="checkbox"][data-key]')?.forEach((c) => (c.checked = val));
  };
  document.querySelectorAll('[data-select-all]')?.forEach((btn) => {
    btn.addEventListener('click', () => setAll(btn.getAttribute('data-select-all'), true));
  });
  document.querySelectorAll('[data-select-none]')?.forEach((btn) => {
    btn.addEventListener('click', () => setAll(btn.getAttribute('data-select-none'), false));
  });

  // 搜索过滤
  document.querySelectorAll('[data-search]')?.forEach((input) => {
    input.addEventListener('input', () => {
      const key = input.getAttribute('data-search');
      const q = input.value.trim().toLowerCase();
      const box = document.querySelector(`[data-list-key="${key}"]`);
      if (!box) return;
      box.querySelectorAll('label')?.forEach((lab) => {
        const text = (lab.textContent || '').toLowerCase();
        lab.style.display = q ? (text.includes(q) ? 'flex' : 'none') : 'flex';
      });
    });
  });
}

// 等待加载配置后再渲染，避免 appConfig 未定义
loadAppConfig().then(() => render());

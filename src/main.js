import './style.css';

// 初始人物数据
let characters = [
  {
    id: 1,
    name: '智慧导师',
    icon: '🧙',
    description: '博学多才，善于解答各种问题',
    personality: '耐心、睿智、温和',
    createdAt: '2024-01-15',
    lastActive: '刚刚',
    conversationCount: 45
  },
  {
    id: 2,
    name: '创意助手',
    icon: '🎨',
    description: '富有想象力，擅长创意和设计',
    personality: '活泼、创新、艺术感强',
    createdAt: '2024-01-10',
    lastActive: '5分钟前',
    conversationCount: 38
  },
  {
    id: 3,
    name: '商业顾问',
    icon: '💼',
    description: '专业商务，擅长策略分析和市场规划',
    personality: '理性、专业、目标导向',
    createdAt: '2024-01-05',
    lastActive: '1小时前',
    conversationCount: 44
  }
];

let currentCharacter = characters[0];
let conversations = {};
let editingCharacterId = null;

function initializeCharacters() {
  // 预留接口：未来可从后端或本地存储同步人物数据
}

function initializeConversations() {
  characters.forEach((char, index) => {
    const baseTs = estimateTimestampFromLastActive(char.lastActive);
    const ts = baseTs ?? Date.now() - index * 5 * 60 * 1000;
    conversations[char.id] = [
      {
        type: 'ai',
        author: char.name,
        text: `你好！我是${char.name}，很高兴与你交流。`,
        time: formatClock(ts),
        timestamp: ts
      }
    ];
  });
}

// 像素风头像（RPG风格）
function pixelWizardSVG() {
  return `
  <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
    <rect x="6" y="1" width="4" height="2" fill="#5d4037"/>
    <rect x="5" y="3" width="6" height="2" fill="#5d4037"/>
    <rect x="4" y="5" width="8" height="1" fill="#5d4037"/>
    <rect x="3" y="6" width="10" height="1" fill="#5d4037"/>
    <rect x="6" y="7" width="4" height="3" fill="#f3c26b"/>
    <rect x="5" y="10" width="6" height="4" fill="#6a1b9a"/>
    <rect x="11" y="9" width="1" height="5" fill="#2e7d32"/>
    <rect x="12" y="9" width="1" height="1" fill="#a5d6a7"/>
  </svg>`;
}
function pixelArtistSVG() {
  return `
  <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
    <rect x="6" y="6" width="4" height="3" fill="#f3c26b"/>
    <rect x="5" y="9" width="6" height="5" fill="#8e44ad"/>
    <rect x="9" y="4" width="3" height="2" fill="#7f8c8d"/>
    <rect x="3" y="10" width="3" height="2" fill="#c49b6e"/>
    <rect x="3" y="10" width="1" height="1" fill="#e74c3c"/>
    <rect x="4" y="11" width="1" height="1" fill="#3498db"/>
    <rect x="5" y="10" width="1" height="1" fill="#f1c40f"/>
  </svg>`;
}
function pixelAdvisorSVG() {
  return `
  <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
    <rect x="6" y="6" width="4" height="3" fill="#f3c26b"/>
    <rect x="5" y="9" width="6" height="5" fill="#34495e"/>
    <rect x="7" y="11" width="2" height="2" fill="#ecf0f1"/>
    <rect x="6" y="4" width="4" height="2" fill="#7f8c8d"/>
  </svg>`;
}
function pixelUserSVG() {
  return `
  <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
    <rect x="6" y="6" width="4" height="3" fill="#f3c26b"/>
    <rect x="5" y="9" width="6" height="5" fill="#6d4c41"/>
  </svg>`;
}
function getPixelAvatarByName(name) {
  if (name === '智慧导师') return pixelWizardSVG();
  if (name === '创意助手') return pixelArtistSVG();
  if (name === '商业顾问') return pixelAdvisorSVG();
  return pixelUserSVG();
}

function formatClock(timestamp) {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function formatRelativeTime(timestamp) {
  const diff = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)}分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)}小时前`;
  return new Date(timestamp).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

function estimateTimestampFromLastActive(label) {
  if (!label) return undefined;
  if (label.includes('刚刚')) return Date.now();
  const m = label.match(/(\d+)分钟/);
  if (m) return Date.now() - parseInt(m[1], 10) * 60 * 1000;
  const h = label.match(/(\d+)小时/);
  if (h) return Date.now() - parseInt(h[1], 10) * 60 * 60 * 1000;
  return undefined;
}

function renderHistoryList() {
  const listContainer = document.getElementById('historyList');
  if (!listContainer) return;
  listContainer.innerHTML = '';

  const keyword = (document.getElementById('historySearch')?.value || '').trim().toLowerCase();

  const historyData = characters
    .map((char) => {
      const msgs = conversations[char.id] || [];
      const lastMsg = msgs[msgs.length - 1];
      const lastTs = lastMsg?.timestamp ?? estimateTimestampFromLastActive(char.lastActive) ?? 0;
      return { char, lastMsg, lastTs };
    })
    .sort((a, b) => b.lastTs - a.lastTs);

  historyData.forEach(({ char, lastMsg, lastTs }) => {
    const timeLabel = lastTs ? formatRelativeTime(lastTs) : '';
    const previewText = lastMsg ? lastMsg.text : '暂无对话';

    // 搜索过滤：按人物名或最后一句话匹配
    if (keyword && !(char.name.toLowerCase().includes(keyword) || previewText.toLowerCase().includes(keyword))) {
      return;
    }

    const item = document.createElement('div');
    item.className = 'history-item';
    item.onclick = () => selectCharacter(char.id);

    item.innerHTML = `
      <div class="history-main">
        <div class="history-title">
          <span class="history-name">${previewText}</span>
          <span class="history-time">${timeLabel}</span>
        </div>
      </div>
    `;

    listContainer.appendChild(item);
  });
}

function renderCharacterSwitcher() {
  // 兼容保留：不再使用顶部横向切换，改为下拉列表
}

function renderCharacterDropdown() {
  const dropdown = document.getElementById('roleDropdown');
  if (!dropdown) return;
  dropdown.innerHTML = '';

  characters.forEach((char) => {
    const item = document.createElement('div');
    item.className = `model-item ${char.id === currentCharacter.id ? 'active' : ''}`;
    item.innerHTML = `
      <div class=\"avatar\">${getPixelAvatarByName(char.name)}</div>
      <div class=\"name\">${char.name}</div>
    `;
    item.onclick = () => {
      selectCharacter(char.id);
      hideCharacterDropdown();
      const label = document.getElementById('roleSwitcherLabel');
      if (label) label.textContent = currentCharacter.name;
      // 切换后头像做一次呼吸动画
      const avatarEl = document.getElementById('currentCharacterAvatar');
      if (avatarEl) {
        avatarEl.classList.remove('pulse');
        // 触发重绘以重启动画
        void avatarEl.offsetWidth;
        avatarEl.classList.add('pulse');
      }
    };
    dropdown.appendChild(item);
  });
}

function toggleCharacterDropdown() {
  const dropdown = document.getElementById('roleDropdown');
  if (!dropdown) return;
  if (dropdown.classList.contains('hidden')) {
    renderCharacterDropdown();
    dropdown.classList.remove('hidden');
    dropdown.classList.add('show');
  } else {
    dropdown.classList.remove('show');
    dropdown.classList.add('hidden');
  }
}

function hideCharacterDropdown() {
  const dropdown = document.getElementById('roleDropdown');
  dropdown?.classList.add('hidden');
}

function renderCharacterList() {
  const listContainer = document.getElementById('characterList');
  if (!listContainer) return;
  listContainer.innerHTML = '';

  characters.forEach((char) => {
    const item = document.createElement('div');
    item.className = `character-item ${char.id === currentCharacter.id ? 'active' : ''}`;
    item.onclick = () => selectCharacter(char.id);

    item.innerHTML = `
      <div class="character-header">
        <div class="character-avatar">${getPixelAvatarByName(char.name)}</div>
        <div class="character-name">${char.name}</div>
      </div>
      <div class="character-desc">${char.description}</div>
      <div style="font-size: 10px; color: #8b4513; margin-top: 5px;">
        最后对话：${char.lastActive}
      </div>
    `;

    listContainer.appendChild(item);
  });
}

function renderCharacterManagement() {
  const container = document.getElementById('characterManagement');
  if (!container) return;
  container.innerHTML = '';

  characters.forEach((char) => {
    const card = document.createElement('div');
    card.className = 'character-card';

    card.innerHTML = `
      <div class="character-avatar" style="width: 60px; height: 60px; font-size: 30px;">${char.icon}</div>
      <div class="character-card-info">
        <h3>${char.name}</h3>
        <p>描述：${char.description}</p>
        <p>性格：${char.personality}</p>
        <div class="meta">创建时间：${char.createdAt}</div>
      </div>
      <div class="character-actions">
        <button class="btn btn-small btn-edit" onclick="editCharacter(${char.id})">编辑</button>
        <button class="btn btn-small btn-delete" onclick="deleteCharacter(${char.id})">删除</button>
      </div>
    `;

    container.appendChild(card);
  });
}

function selectCharacter(characterId) {
  const nextCharacter = characters.find((char) => char.id === characterId);
  if (!nextCharacter) return;
  currentCharacter = nextCharacter;
  renderCharacterList();
  renderCharacterDropdown();
  loadConversation(characterId);

  const avatar = document.getElementById('currentCharacterAvatar');
  const name = document.getElementById('currentCharacterName');
  if (avatar) avatar.innerHTML = getPixelAvatarByName(currentCharacter.name);
  if (name) name.textContent = currentCharacter.name;
}

function loadConversation(characterId) {
  const messagesContainer = document.getElementById('chatMessages');
  if (!messagesContainer) return;
  messagesContainer.innerHTML = '';

  const messages = conversations[characterId] || [];
  messages.forEach((msg) => {
    addMessageToUI(msg);
  });

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addMessageToUI(message) {
  const messagesContainer = document.getElementById('chatMessages');
  if (!messagesContainer) return;
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${message.type}`;

  const avatarHTML = message.type === 'ai' ? getPixelAvatarByName(currentCharacter.name) : pixelUserSVG();

  // 连续消息合并：如果上一条是同一侧，则标记为连续
  const last = messagesContainer.lastElementChild;
  const isGrouped = last && last.classList.contains(message.type);
  if (isGrouped) {
    messageDiv.classList.add('grouped');
  }

  if (message.type === 'ai') {
    messageDiv.innerHTML = `
      <div class="message-avatar">${avatarHTML}</div>
      <div class="message-content">
        <div class="message-text">${message.text}</div>
      </div>
      <div class="message-time outside">${message.time}</div>
    `;
  } else {
    // 用户消息：时间在左侧，气泡在右侧
    messageDiv.innerHTML = `
      <div class="message-time outside">${message.time}</div>
      <div class="message-content">
        <div class="message-text">${message.text}</div>
      </div>
      <div class="message-avatar">${avatarHTML}</div>
    `;
  }

  messagesContainer.appendChild(messageDiv);
}

function sendMessage() {
  const input = document.getElementById('messageInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  const nowTs = Date.now();
  const userMessage = {
    type: 'user',
    text,
    time: formatClock(nowTs),
    timestamp: nowTs
  };

  conversations[currentCharacter.id].push(userMessage);
  addMessageToUI(userMessage);
  input.value = '';

  bumpCurrentCharacterActivity();

  setTimeout(() => {
    const writeAI = (content) => {
      const aiTs = Date.now();
      const aiMessage = {
        type: 'ai',
        author: currentCharacter.name,
        text: content,
        time: formatClock(aiTs),
        timestamp: aiTs
      };
      conversations[currentCharacter.id].push(aiMessage);
      addMessageToUI(aiMessage);
      const messagesContainer = document.getElementById('chatMessages');
      if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
      bumpCurrentCharacterActivity();
    };

    if (localStorage.getItem('dev_enabled') === 'true') {
      loadAppConfig().then(() => {
        // 将 admin 保存的 base 覆盖到 appConfig.dev
        appConfig.dev = appConfig.dev || {};
        appConfig.dev.enabled = true;
        appConfig.dev.llmBase = localStorage.getItem('dev_llm_base') || appConfig.dev.llmBase;
        localStorage.getItem('dev_api_key');
        callTextLLMDev(text).then(writeAI);
      });
    } else {
      const aiTs = Date.now();
      writeAI(generateAIResponse(text, currentCharacter));
    }
    
  }, 1000);
}

function generateAIResponse(userText, character) {
  const responses = {
    智慧导师: [
      '这是一个很有趣的问题，让我来为你详细解答。',
      '从我的经验来看，这个问题有几个关键点需要考虑。',
      '你提出了一个很好的观点，我建议你可以从以下几个方面深入思考。'
    ],
    创意助手: [
      '哇！这个想法太有创意了！我有一些更有趣的建议给你。',
      '让我发挥一下想象力，我觉得可以这样设计...',
      '这个概念很棒！我们可以加入更多创新的元素。'
    ],
    商业顾问: [
      '从商业角度分析，这个方案有几个优势和需要注意的风险。',
      '根据市场调研数据，我建议采用以下策略来优化这个项目。',
      '这个投资机会看起来很有潜力，但我们需要仔细评估ROI。'
    ]
  };

  const characterResponses = responses[character.name] || ['这是一个很好的问题，让我为你分析一下。'];
  return characterResponses[Math.floor(Math.random() * characterResponses.length)];
}

// 前端直连（无后端）调用演示：仅用于开发自测
async function callTextLLMDev(prompt) {
  if (!appConfig?.dev?.enabled) {
    console.warn('dev 直连未启用');
    return '（本地直连未启用）';
  }
  const base = appConfig.dev.llmBase;
  const key = localStorage.getItem('dev_api_key') || '';
  const model = localStorage.getItem('cfg_llm_model') || (appConfig.defaults?.llm?.[0] || '');
  if (!base || !key || !model) return '（请在 Admin 页或本地存储中配置 dev_api_key/模型）';

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [appConfig.dev.authHeader || 'Authorization']: `${appConfig.dev.authScheme || 'Bearer'} ${key}`
      },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || JSON.stringify(data);
    return text;
  } catch (e) {
    return `调用失败：${e?.message || e}`;
  }
}

function handleKeyPress(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    sendMessage();
  }
}

function showSettings() {
  const chat = document.getElementById('chatInterface');
  const settings = document.getElementById('settingsInterface');
  chat?.classList.remove('active');
  settings?.classList.add('active');
}

function showChat() {
  const chat = document.getElementById('chatInterface');
  const settings = document.getElementById('settingsInterface');
  settings?.classList.remove('active');
  chat?.classList.add('active');
}

function showSettingsTab(event, tab) {
  document.querySelectorAll('.menu-item').forEach((item) => item.classList.remove('active'));
  event.currentTarget.classList.add('active');

  const panels = {
    characters: document.getElementById('panel-characters'),
    models: document.getElementById('panel-models')
  };
  Object.values(panels).forEach((p) => p?.classList.add('hidden'));
  panels[tab]?.classList.remove('hidden');
}

// 运行时配置：从 /app-config.json 读取，替代 Vite 前缀暴露
let appConfig = null;
function loadAppConfig() {
  if (appConfig) return Promise.resolve(appConfig);
  return fetch('/app-config.json', { cache: 'no-store' })
    .then((r) => r.json())
    .then((cfg) => (appConfig = cfg))
    .catch(() => (appConfig = { defaults: {} }));
}

function readEnvList(key, fallback) {
  const map = {
    VITE_LLM_MODELS: appConfig?.defaults?.llm,
    VITE_ASR_MODELS: appConfig?.defaults?.asr,
    VITE_TTS_VOICES: appConfig?.defaults?.ttsVoices,
    VITE_VOICE_MODELS: appConfig?.defaults?.voiceModels
  };
  const arr = map[key];
  return Array.isArray(arr) && arr.length ? arr : fallback;
}

function getEnvConfigOptions() {
  // 后端/部署层可通过 .env 注入以下列表（不含敏感信息）
  const envLlm = readEnvList('VITE_LLM_MODELS', ['gpt-4o-mini', 'claude-3.5-haiku', 'qwen2.5-14b']);
  const envAsr = readEnvList('VITE_ASR_MODELS', ['deepgram:nova-2', 'whisper:large-v3', 'azure:speech']);
  const envTts = readEnvList('VITE_TTS_VOICES', ['openai:alloy', 'elevenlabs:Rachel', 'azure:zh-CN-XiaoxiaoNeural']);
  const envVrm = readEnvList('VITE_VOICE_MODELS', ['openai:gpt-4o-realtime', 'deepgram:aura']);

  // 可见列表优先：由 admin 页面写入 localStorage
  const parse = (k, def) => {
    try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : def; } catch { return def; }
  };
  const llm = parse('visible_llm_models', envLlm);
  const asr = parse('visible_asr_models', envAsr);
  const ttsVoices = parse('visible_tts_voices', envTts);
  const voiceModels = parse('visible_voice_models', envVrm);
  return { llm, asr, ttsVoices, voiceModels };
}

function renderModelsPanel() {
  const panel = document.getElementById('panel-models');
  if (!panel) return;

  const populate = (lists) => {
    const { llm, asr, ttsVoices, voiceModels } = lists;

    const get = (k, d) => localStorage.getItem(k) || d;
    const state = {
      llm: get('cfg_llm_model', llm[0] || ''),
      asr: get('cfg_asr_model', asr[0] || ''),
      tts: get('cfg_tts_voice', ttsVoices[0] || ''),
      vrm: get('cfg_voice_model', voiceModels[0] || '')
    };

    const optionsHTML = (arr, selected) =>
      arr.map((v) => `<option value="${v}" ${v === selected ? 'selected' : ''}>${v}</option>`).join('');

    panel.innerHTML = `
      <div class="form-section">
        <div class="form-row">
          <label>文本 LLM</label>
          <select id="sel-llm" class="select">${optionsHTML(llm, state.llm)}</select>
        </div>
        <div class="form-row">
          <label>ASR（语音识别）</label>
          <select id="sel-asr" class="select">${optionsHTML(asr, state.asr)}</select>
        </div>
        <div class="form-row">
          <label>TTS 声音</label>
          <select id="sel-tts" class="select">${optionsHTML(ttsVoices, state.tts)}</select>
        </div>
        <div class="form-row">
          <label>语音大模型</label>
          <select id="sel-vrm" class="select">${optionsHTML(voiceModels, state.vrm)}</select>
        </div>
        <div class="form-actions">
          <button id="btn-save-models" class="btn">保存</button>
          <button id="btn-reset-models" class="btn btn-secondary">恢复默认</button>
        </div>
      </div>
    `;

    document.getElementById('btn-save-models')?.addEventListener('click', () => {
      const llmSel = document.getElementById('sel-llm');
      const asrSel = document.getElementById('sel-asr');
      const ttsSel = document.getElementById('sel-tts');
      const vrmSel = document.getElementById('sel-vrm');
      localStorage.setItem('cfg_llm_model', llmSel?.value || '');
      localStorage.setItem('cfg_asr_model', asrSel?.value || '');
      localStorage.setItem('cfg_tts_voice', ttsSel?.value || '');
      localStorage.setItem('cfg_voice_model', vrmSel?.value || '');
      alert('已保存模型与声音选择');
    });

    document.getElementById('btn-reset-models')?.addEventListener('click', () => {
      localStorage.removeItem('cfg_llm_model');
      localStorage.removeItem('cfg_asr_model');
      localStorage.removeItem('cfg_tts_voice');
      localStorage.removeItem('cfg_voice_model');
      renderModelsPanel();
    });
  };

  // 先用本地 admin/env 渲染
  populate(getEnvConfigOptions());

  // 若配置了后端接口，则尝试拉取可见列表并覆盖
  const remoteUrl = appConfig?.visibleModelsUrl || '';
  if (remoteUrl) {
    fetch(remoteUrl)
      .then((r) => r.json())
      .then((json) => {
        const lists = {
          llm: json.llm || json.llms || [],
          asr: json.asr || json.asrs || [],
          ttsVoices: json.ttsVoices || json.tts || [],
          voiceModels: json.voiceModels || json.vrm || []
        };
        if (lists.llm.length || lists.asr.length || lists.ttsVoices.length || lists.voiceModels.length) {
          populate(lists);
        }
      })
      .catch(() => {});
  }
}

function showAddCharacterModal() {
  editingCharacterId = null;
  const modalTitle = document.getElementById('modalTitle');
  modalTitle.textContent = '添加新人物';
  const form = document.getElementById('characterForm');
  form.reset();
  document.getElementById('characterModal').style.display = 'block';
}

function editCharacter(characterId) {
  const character = characters.find((char) => char.id === characterId);
  if (!character) return;

  editingCharacterId = characterId;
  document.getElementById('modalTitle').textContent = '编辑人物';
  document.getElementById('characterName').value = character.name;
  document.getElementById('characterIcon').value = character.icon;
  document.getElementById('characterDesc').value = character.description;
  document.getElementById('characterPersonality').value = character.personality;
  document.getElementById('characterModal').style.display = 'block';
}

function deleteCharacter(characterId) {
  if (!confirm('确定要删除这个人物吗？')) return;

  characters = characters.filter((char) => char.id !== characterId);
  delete conversations[characterId];

  if (currentCharacter.id === characterId && characters.length > 0) {
    currentCharacter = characters[0];
  }

  renderCharacterList();
  renderCharacterManagement();
  updateStats();

  if (characters.length > 0) {
    loadConversation(currentCharacter.id);
    document.getElementById('currentCharacterAvatar').textContent = currentCharacter.icon;
    document.getElementById('currentCharacterName').textContent = currentCharacter.name;
  }
}

function closeCharacterModal() {
  document.getElementById('characterModal').style.display = 'none';
}

function updateStats() {
  const totalCharacters = characters.length;
  const totalConversations = Object.values(conversations).reduce(
    (sum, convs) => sum + convs.filter((msg) => msg.type === 'user').length,
    0
  );

  const mostActive = characters.reduce((prev, current) =>
    prev.conversationCount > current.conversationCount ? prev : current,
    characters[0]
  );

  const totalCharactersEl = document.getElementById('totalCharacters');
  const totalConversationsEl = document.getElementById('totalConversations');
  const mostActiveEl = document.getElementById('mostActive');

  if (totalCharactersEl) totalCharactersEl.textContent = totalCharacters;
  if (totalConversationsEl) totalConversationsEl.textContent = totalConversations;
  if (mostActiveEl) mostActiveEl.textContent = mostActive ? mostActive.name : '无';
}

function bumpCurrentCharacterActivity() {
  const character = characters.find((c) => c.id === currentCharacter.id);
  if (character) {
    character.lastActive = '刚刚';
    character.conversationCount = (character.conversationCount || 0) + 1;
  }
  renderHistoryList();
  renderCharacterManagement();
  renderCharacterDropdown();
  updateStats();
}

function attachFile() {
  alert('附件功能开发中...');
}

function startVoiceCall() {
  alert('语音通话功能开发中...');
}

document.addEventListener('DOMContentLoaded', () => {
  // 先加载运行时配置，再初始化应用（避免读取为空）
  loadAppConfig().then(() => {
  initializeCharacters();
  initializeConversations();
  renderCharacterList();
  renderHistoryList();
  renderCharacterDropdown();
  renderCharacterManagement();
  loadConversation(currentCharacter.id);
  updateStats();

  // 设置页默认显示人物设置
  showSettingsTab({ currentTarget: document.querySelector('.settings-menu .menu-item') }, 'characters');

  // 渲染模型设置（从 app-config/admin/接口 读取候选）
  renderModelsPanel();

  // 绑定侧边栏搜索
  const searchInput = document.getElementById('historySearch');
  searchInput?.addEventListener('input', () => {
    renderHistoryList();
  });

  // 主题初始化与切换
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.body.setAttribute('data-theme', savedTheme);

  // 初始化主题切换控件状态
  const seg = document.querySelector('.theme-toggle');
  const syncSegState = () => {
    seg?.querySelectorAll('.seg-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.theme === (localStorage.getItem('theme') || 'dark'));
    });
  };
  syncSegState();
  seg?.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    const theme = btn.dataset.theme;
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    syncSegState();
  });

  const avatarEl = document.getElementById('currentCharacterAvatar');
  avatarEl?.addEventListener('click', (e) => {
    e.stopPropagation();
    // 将下拉定位到头像左上相对位置
    const dropdown = document.getElementById('roleDropdown');
    if (dropdown) {
      const rect = avatarEl.getBoundingClientRect();
      const headerRect = document.querySelector('.chat-header').getBoundingClientRect();
      dropdown.style.left = `${rect.left - headerRect.left}px`;
      dropdown.style.top = `${rect.bottom - headerRect.top + 8}px`;
    }
    toggleCharacterDropdown();
  });

  // 顶部角色切换按钮
  const roleBtn = document.getElementById('roleNameButton');
  roleBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById('roleDropdown');
    if (dropdown) {
      // 定位到按钮左侧
      const rect = roleBtn.getBoundingClientRect();
      const headerRect = document.querySelector('.chat-header').getBoundingClientRect();
      dropdown.style.left = `${rect.left - headerRect.left}px`;
      dropdown.style.top = `${rect.bottom - headerRect.top + 8}px`;
    }
    toggleCharacterDropdown();
  });

  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('roleDropdown');
    if (!dropdown || dropdown.classList.contains('hidden')) return;
    const avatar = document.getElementById('currentCharacterAvatar');
    const roleBtnLocal = document.getElementById('roleNameButton');
    if (dropdown.contains(e.target) || avatar?.contains(e.target) || roleBtnLocal?.contains(e.target)) return;
    hideCharacterDropdown();
  });

  const characterForm = document.getElementById('characterForm');
  characterForm?.addEventListener('submit', (e) => {
    e.preventDefault();

    const formData = {
      name: document.getElementById('characterName').value,
      icon: document.getElementById('characterIcon').value,
      description: document.getElementById('characterDesc').value,
      personality: document.getElementById('characterPersonality').value
    };

    if (editingCharacterId) {
      const character = characters.find((char) => char.id === editingCharacterId);
      if (character) {
        Object.assign(character, formData);
      }
    } else {
      const newCharacter = {
        id: Date.now(),
        ...formData,
        createdAt: new Date().toISOString().split('T')[0],
        lastActive: '刚刚',
        conversationCount: 0
      };
      characters.push(newCharacter);
      conversations[newCharacter.id] = [];
    }

    renderCharacterList();
    renderHistoryList();
    renderCharacterManagement();
    updateStats();
    closeCharacterModal();
  });
  });
});

// 暴露给内联事件处理器
window.showSettings = showSettings;
window.showChat = showChat;
window.showSettingsTab = showSettingsTab;
window.showAddCharacterModal = showAddCharacterModal;
window.editCharacter = editCharacter;
window.deleteCharacter = deleteCharacter;
window.closeCharacterModal = closeCharacterModal;
window.sendMessage = sendMessage;
window.handleKeyPress = handleKeyPress;
window.attachFile = attachFile;
window.startVoiceCall = startVoiceCall;
window.setTheme = (theme) => {
  document.body.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
};

// 新建对话：为当前人物创建一条空会话并切换到该人物
window.newConversation = () => {
  const cid = currentCharacter.id;
  if (!conversations[cid]) conversations[cid] = [];
  // 清空当前人物的消息，视为新会话
  conversations[cid] = [];
  loadConversation(cid);
  renderHistoryList();
};

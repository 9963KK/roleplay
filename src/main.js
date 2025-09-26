import './style.css';
import { defaultCharacters } from './shared/defaultCharacters.js';

const CHARACTER_STORAGE_KEY = 'app_characters';

function cloneCharacters(list) {
  return list.map((char) => ({ ...char }));
}

function normalizeCharacter(char, index) {
  const avatarType = char?.avatarType
    || (char?.avatarUrl ? 'url'
      : (char?.icon ? 'emoji' : 'pixel'));
  const avatarUrl = char?.avatarUrl || '';
  const iconValue = typeof char?.icon === 'string' ? char.icon : '';
  return {
    id: char?.id ?? Date.now() + index,
    name: char?.name || `角色${index + 1}`,
    icon: iconValue || '🧑',
    description: char?.description || '',
    personality: char?.personality || '',
    background: char?.background || '',
    responseFormat: char?.responseFormat || '',
    openingMessage: char?.openingMessage || '',
    avatarType,
    avatarUrl,
    createdAt: char?.createdAt || new Date().toISOString().split('T')[0],
    lastActive: char?.lastActive || '刚刚',
    conversationCount: char?.conversationCount || 0
  };
}

function saveCharacters(list) {
  try {
    localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

function loadStoredCharacters() {
  try {
    const raw = localStorage.getItem(CHARACTER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return null;
    return parsed.map((char, idx) => normalizeCharacter(char, idx));
  } catch {
    return null;
  }
}

function loadCharacters() {
  const stored = loadStoredCharacters();
  if (stored) return stored;
  const defaults = cloneCharacters(defaultCharacters).map((char, idx) => normalizeCharacter(char, idx));
  saveCharacters(defaults);
  return defaults;
}

let characters = loadCharacters();
let currentCharacter = characters[0] || null;
let conversations = {};
// 历史会话归档：每个人物可有多个旧会话
let archivedSessions = {}; // { [charId]: Array<{ id:string, messages:Message[] }> }
let viewingArchived = null; // { charId, sessionId } 当查看归档会话时标记
let editingCharacterId = null;
const ADMIN_PROMPTS_KEY = 'admin_character_prompts';
let avatarFormState = {
  mode: 'emoji',
  emoji: '',
  url: '',
  uploadData: '',
  uploadName: '',
  baseCharacter: null
};
const voiceInputState = {
  isRecording: false,
  processing: false,
  recognition: null,
  mediaRecorder: null,
  mediaStream: null,
  chunks: [],
  baseText: '',
  lastPartial: ''
};

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttribute(str = '') {
  return escapeHtml(str).replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
}

function getCharacterAvatarMarkup(char, size = 40) {
  const safeSize = Number.isFinite(size) ? Math.max(24, size) : 40;
  const dimensionStyle = `style="width:${safeSize}px;height:${safeSize}px;"`;
  if (!char) {
    return `<div class="avatar-chip" ${dimensionStyle}><span class="avatar-emoji" style="font-size:${Math.round(safeSize * 0.6)}px;">🖼️</span></div>`;
  }
  const type = char.avatarType;
  const urlValue = char.avatarUrl;
  if ((type === 'url' || type === 'upload') && urlValue) {
    return `<div class="avatar-chip" ${dimensionStyle}><img src="${escapeAttribute(urlValue)}" alt="${escapeAttribute(char.name || 'avatar')}" /></div>`;
  }
  if ((type === 'emoji' || (!type && char.icon)) && char.icon) {
    return `<div class="avatar-chip" ${dimensionStyle}><span class="avatar-emoji" style="font-size:${Math.round(safeSize * 0.6)}px;">${escapeHtml(char.icon)}</span></div>`;
  }
  const pixel = getPixelAvatarByName(char.name || '');
  return `<div class="avatar-chip avatar-pixel-wrapper" ${dimensionStyle}>${pixel}</div>`;
}

// 发送状态：等待大模型返回时禁止再次发送
let isAwaitingResponse = false;
function setSendingState(pending) {
  isAwaitingResponse = pending;
  const input = document.getElementById('messageInput');
  const sendBtn = document.querySelector('.send-btn');
  if (input) {
    input.disabled = pending;
    if (pending) {
      input.setAttribute('data-prev-ph', input.getAttribute('placeholder') || '');
      input.setAttribute('placeholder', '正在生成回复…');
    } else {
      const prev = input.getAttribute('data-prev-ph');
      if (prev !== null) input.setAttribute('placeholder', prev);
    }
  }
  if (sendBtn) sendBtn.disabled = pending;
}

function initializeCharacters() {
  // 预留接口：未来可从后端或本地存储同步人物数据
}

function createOpeningMessage(character, timestamp = Date.now()) {
  const openingText = (character?.openingMessage && character.openingMessage.trim())
    || `你好！我是${character?.name || '伙伴'}，很高兴与你交流。`;
  return {
    type: 'ai',
    author: character?.name || 'AI',
    text: openingText,
    time: formatClock(timestamp),
    timestamp
  };
}

function initializeConversations() {
  if (!characters.length) return;
  characters.forEach((char, index) => {
    const baseTs = estimateTimestampFromLastActive(char.lastActive);
    const ts = baseTs ?? Date.now() - index * 5 * 60 * 1000;
    conversations[char.id] = [createOpeningMessage(char, ts)];
    archivedSessions[char.id] = [];
  });
}

function readAdminPromptById(id) {
  if (!id) return '';
  try {
    const raw = localStorage.getItem(ADMIN_PROMPTS_KEY);
    if (!raw) return '';
    const map = JSON.parse(raw);
    if (map && typeof map === 'object') {
      const entry = map[id] ?? map[Number(id)] ?? null;
      if (!entry) return '';
      if (typeof entry === 'string') return entry;
      return entry?.prompt || '';
    }
    return '';
  } catch {
    return '';
  }
}

function composeSystemPrompt(character) {
  if (!character) return '';
  const segments = [];
  const adminPrompt = readAdminPromptById(character.id);
  if (adminPrompt) segments.push(adminPrompt);
  if (character.description) segments.push(`角色定位：\n${character.description}`);
  if (character.personality) segments.push(`性格特征：\n${character.personality}`);
  if (character.background) segments.push(`背景信息：\n${character.background}`);
  if (character.responseFormat) segments.push(`回答格式要求：\n${character.responseFormat}`);
  return segments.join('\n\n').trim();
}

function buildChatMessages(userText, character) {
  const messages = [];
  const systemPrompt = composeSystemPrompt(character);
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: userText });
  return messages;
}

function refreshUploadHint() {
  const hintEl = document.querySelector('.avatar-upload-hint');
  if (!hintEl) return;
  if (!hintEl.dataset.defaultHint) hintEl.dataset.defaultHint = hintEl.textContent;
  const labelText = avatarFormState.uploadData && avatarFormState.uploadName
    ? `已选择：${avatarFormState.uploadName}`
    : hintEl.dataset.defaultHint;
  hintEl.textContent = labelText;
  const labelBtn = document.querySelector('.avatar-upload-btn span');
  if (labelBtn) {
    labelBtn.textContent = avatarFormState.uploadData ? '重新选择图片' : '选择图片';
  }
}

function avatarStateToDisplay() {
  if (avatarFormState.mode === 'emoji' && avatarFormState.emoji.trim()) {
    return { type: 'emoji', value: avatarFormState.emoji.trim() };
  }
  if (avatarFormState.mode === 'url' && avatarFormState.url.trim()) {
    return { type: 'image', value: avatarFormState.url.trim() };
  }
  if (avatarFormState.mode === 'upload' && avatarFormState.uploadData) {
    return { type: 'image', value: avatarFormState.uploadData };
  }
  const base = avatarFormState.baseCharacter;
  if (base) {
    if ((base.avatarType === 'url' || base.avatarType === 'upload') && base.avatarUrl) {
      return { type: 'image', value: base.avatarUrl };
    }
    if (base.avatarType === 'emoji' && base.icon) {
      return { type: 'emoji', value: base.icon };
    }
  }
  return { type: 'placeholder', value: '🖼️' };
}

function updateAvatarPreview() {
  const preview = document.getElementById('avatarPreview');
  if (!preview) return;
  const display = avatarStateToDisplay();
  if (display.type === 'image') {
    preview.innerHTML = `<div class="avatar-img-wrapper"><img src="${escapeAttribute(display.value)}" alt="头像预览" /></div>`;
  } else if (display.type === 'emoji') {
    preview.innerHTML = `<span class="avatar-emoji">${escapeHtml(display.value)}</span>`;
  } else {
    preview.innerHTML = `<span class="placeholder">${escapeHtml(display.value)}</span>`;
  }
  refreshUploadHint();
}

function switchAvatarMode(mode, focus = true) {
  avatarFormState.mode = mode;
  document.querySelectorAll('.avatar-mode-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.avatarMode === mode);
  });
  document.querySelectorAll('.avatar-input-field').forEach((field) => {
    const fieldMode = field.getAttribute('data-avatar-field');
    const isActive = fieldMode === mode;
    field.classList.toggle('hidden', !isActive);
    if (isActive && focus) {
      const input = field.querySelector('input:not([type="file"])');
      input?.focus();
    }
  });
  updateAvatarPreview();
}

function handleAvatarFileChange(event) {
  const file = event.target?.files?.[0];
  if (!file) {
    avatarFormState.uploadData = '';
    avatarFormState.uploadName = '';
    updateAvatarPreview();
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    avatarFormState.uploadData = e.target?.result || '';
    avatarFormState.uploadName = file.name || '';
    switchAvatarMode('upload', false);
    updateAvatarPreview();
  };
  reader.readAsDataURL(file);
}

function prepareAvatarControls(character) {
  avatarFormState = {
    mode: 'emoji',
    emoji: '',
    url: '',
    uploadData: '',
    uploadName: '',
    baseCharacter: character || null
  };
  if (character) {
    if (character.avatarType === 'url') {
      avatarFormState.mode = 'url';
      avatarFormState.url = character.avatarUrl || '';
    } else if (character.avatarType === 'upload') {
      avatarFormState.mode = 'upload';
      avatarFormState.uploadData = character.avatarUrl || '';
      avatarFormState.uploadName = character.avatarUrl ? '已保存图片' : '';
    } else if (character.avatarType === 'emoji') {
      avatarFormState.mode = 'emoji';
      avatarFormState.emoji = character.icon || '';
    } else if (character.icon) {
      avatarFormState.mode = 'emoji';
      avatarFormState.emoji = character.icon;
    }
  }
  const emojiInput = document.getElementById('characterEmoji');
  if (emojiInput) emojiInput.value = avatarFormState.emoji || '';
  const urlInput = document.getElementById('characterAvatarUrl');
  if (urlInput) urlInput.value = avatarFormState.url || '';
  const fileInput = document.getElementById('characterAvatarFile');
  if (fileInput) fileInput.value = '';
  switchAvatarMode(avatarFormState.mode, false);
  updateAvatarPreview();
}

function getAvatarFormResult() {
  const emojiValue = avatarFormState.emoji?.trim();
  const urlValue = avatarFormState.url?.trim();
  if (avatarFormState.mode === 'emoji' && emojiValue) {
    return { avatarType: 'emoji', avatarUrl: '', icon: emojiValue };
  }
  if (avatarFormState.mode === 'url' && urlValue) {
    return { avatarType: 'url', avatarUrl: urlValue, icon: '' };
  }
  if (avatarFormState.mode === 'upload' && avatarFormState.uploadData) {
    return { avatarType: 'upload', avatarUrl: avatarFormState.uploadData, icon: '' };
  }
  const base = avatarFormState.baseCharacter;
  if (base) {
    return {
      avatarType: base.avatarType || 'emoji',
      avatarUrl: base.avatarUrl || '',
      icon: base.icon || ''
    };
  }
  return { avatarType: 'emoji', avatarUrl: '', icon: emojiValue || '🙂' };
}

function getPreferredASRModel() {
  const selected = localStorage.getItem('cfg_asr_model');
  if (selected) return selected;
  try {
    const stored = localStorage.getItem('visible_asr_models');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length) return parsed[0];
    }
  } catch (e) {
    console.warn('解析可见 ASR 模型失败', e);
  }
  if (appConfig?.defaults?.asr && appConfig.defaults.asr.length) {
    return appConfig.defaults.asr[0];
  }
  return '';
}

function updateVoiceButton() {
  const btn = document.querySelector('[data-action="voice"]');
  if (!btn) return;
  btn.classList.toggle('recording', voiceInputState.isRecording);
  btn.classList.toggle('loading', voiceInputState.processing);
  btn.setAttribute('aria-pressed', voiceInputState.isRecording ? 'true' : 'false');
  btn.disabled = voiceInputState.processing;
}

function setVoiceProcessing(flag) {
  voiceInputState.processing = flag;
  updateVoiceButton();
}

function applyTranscribedText(text, finalize = false) {
  const input = document.getElementById('messageInput');
  if (!input) return;
  const cleaned = (text || '').trim();
  if (finalize) {
    voiceInputState.baseText = [voiceInputState.baseText, cleaned].filter(Boolean).join(' ').trim();
    voiceInputState.lastPartial = '';
    input.value = voiceInputState.baseText;
  } else {
    voiceInputState.lastPartial = cleaned;
    const composed = [voiceInputState.baseText, voiceInputState.lastPartial].filter(Boolean).join(' ').trim();
    input.value = composed;
  }
  input.focus();
}

function cleanupVoiceStream() {
  if (voiceInputState.mediaStream) {
    voiceInputState.mediaStream.getTracks()?.forEach((track) => track.stop());
  }
  voiceInputState.mediaStream = null;
}

function stopVoiceInput(triggerTranscription = true) {
  if (!voiceInputState.isRecording) return;
  if (voiceInputState.recognition) {
    const recognition = voiceInputState.recognition;
    voiceInputState.recognition = null;
    recognition.stop();
    voiceInputState.isRecording = false;
    if (triggerTranscription && voiceInputState.lastPartial) {
      applyTranscribedText(voiceInputState.lastPartial, true);
    }
    updateVoiceButton();
    return;
  }
  if (voiceInputState.mediaRecorder) {
    try {
      voiceInputState.mediaRecorder.stop();
    } catch (e) {
      console.warn('停止录音失败', e);
    }
  }
  cleanupVoiceStream();
  voiceInputState.isRecording = false;
  updateVoiceButton();
}

async function transcribeAudioBlob(blob) {
  if (!blob || !blob.size) return;
  setVoiceProcessing(true);
  try {
    await loadAppConfig();
    const devEnabled = localStorage.getItem('dev_enabled') === 'true';
    const model = getPreferredASRModel();
    const formData = new FormData();
    formData.append('file', blob, `recording-${Date.now()}.webm`);
    if (model) formData.append('model', model);

    let url = '';
    const headers = {};

    if (devEnabled) {
      const base = localStorage.getItem('dev_asr_base') || appConfig?.dev?.asrBase || appConfig?.dev?.llmBase;
      if (!base) throw new Error('未配置 ASR Base 地址');
      const endpoint = appConfig?.dev?.asrTranscribeEndpoint || '/v1/audio/transcriptions';
      url = `${base}${endpoint}`;
      const apiKey = localStorage.getItem('dev_asr_key');
      if (apiKey) {
        const authHeader = appConfig?.dev?.authHeader || 'Authorization';
        const authScheme = appConfig?.dev?.authScheme || 'Bearer';
        headers[authHeader] = `${authScheme} ${apiKey}`;
      }
    } else {
      const base = appConfig?.apiBase || '';
      const defaultRoute = appConfig?.asrRoute || '/asr/transcribe';
      url = `${base}${defaultRoute}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `HTTP ${response.status}`);
    }

    const result = await response.json().catch(() => ({}));
    const transcript = result.text || result.transcript || result.result || result.data?.text || '';
    if (transcript) {
      applyTranscribedText(transcript, true);
    } else {
      alert('未获取到识别结果');
    }
  } catch (error) {
    console.error('ASR 请求失败', error);
    alert(`语音识别失败：${error?.message || error}`);
  } finally {
    setVoiceProcessing(false);
  }
}

function startWebSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return false;
  try {
    const recognition = new SpeechRecognition();
    recognition.lang = navigator.language || 'zh-CN';
    recognition.interimResults = true;
    recognition.continuous = true;
    voiceInputState.baseText = (document.getElementById('messageInput')?.value || '').trim();
    voiceInputState.lastPartial = '';

    recognition.onresult = (event) => {
      let interim = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result) continue;
        const transcript = result[0]?.transcript || '';
        if (result.isFinal) finalText += transcript;
        else interim += transcript;
      }
      if (interim) applyTranscribedText(interim, false);
      if (finalText) applyTranscribedText(finalText, true);
    };

    recognition.onerror = (event) => {
      console.error('SpeechRecognition error', event);
      alert(`语音识别错误：${event?.error || '未知错误'}`);
      stopVoiceInput(false);
    };

    recognition.onend = () => {
      voiceInputState.recognition = null;
      voiceInputState.isRecording = false;
      updateVoiceButton();
    };

    recognition.start();
    voiceInputState.recognition = recognition;
    voiceInputState.isRecording = true;
    updateVoiceButton();
    return true;
  } catch (err) {
    console.warn('SpeechRecognition 启动失败', err);
    return false;
  }
}

async function startMediaRecorderFlow() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前浏览器不支持麦克风采集');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    const mediaRecorder = new MediaRecorder(stream, { mimeType });
    voiceInputState.mediaRecorder = mediaRecorder;
    voiceInputState.mediaStream = stream;
    voiceInputState.chunks = [];
    voiceInputState.baseText = (document.getElementById('messageInput')?.value || '').trim();
    voiceInputState.lastPartial = '';

    mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data && event.data.size > 0) voiceInputState.chunks.push(event.data);
    });

    mediaRecorder.addEventListener('stop', async () => {
      const blob = new Blob(voiceInputState.chunks, { type: mediaRecorder.mimeType });
      cleanupVoiceStream();
      voiceInputState.mediaRecorder = null;
      voiceInputState.isRecording = false;
      updateVoiceButton();
      voiceInputState.chunks = [];
      if (blob.size > 0) {
        await transcribeAudioBlob(blob);
      }
    });

    mediaRecorder.start();
    voiceInputState.isRecording = true;
    updateVoiceButton();
  } catch (error) {
    console.error('启动 MediaRecorder 失败', error);
    alert(`无法访问麦克风：${error?.message || error}`);
    cleanupVoiceStream();
    voiceInputState.mediaRecorder = null;
    voiceInputState.isRecording = false;
    updateVoiceButton();
  }
}

function parseReasoningSections(text) {
  if (!text) return null;
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 4) return null;
  const headingPattern = /^([A-Za-z\u4e00-\u9fa5]{1,16})(?:[:：])?$/;
  const sections = [];
  let current = null;
  lines.forEach((line) => {
    const isHeading = headingPattern.test(line) && line.length <= 10;
    if (isHeading) {
      if (current) sections.push(current);
      current = { title: line.replace(/[:：]$/, ''), body: [] };
    } else {
      if (!current) {
        current = { title: '思考', body: [] };
      }
      current.body.push(line);
    }
  });
  if (current) sections.push(current);
  if (sections.length < 2) return null;
  return sections;
}

function renderReasoningHTML(text) {
  const sections = parseReasoningSections(text);
  if (!sections) return null;
  const iconMap = {
    背景: '🗺️',
    角色: '🧍',
    思考: '🧠',
    分析: '🔍',
    计划: '🗒️',
    策略: '🧭',
    行动建议: '✅',
    建议: '✅',
    结果: '📌',
    总结: '📘'
  };
const fallbackIcons = ['🧠', '🔍', '✅', '💡', '🗺️'];
let fallbackIndex = 0;
  const sectionsHTML = sections
    .map((section) => {
      const icon = iconMap[section.title] || fallbackIcons[fallbackIndex++ % fallbackIcons.length];
      const bodyMarkdown = section.body.join('\n');
      const bodyHTML = renderMarkdown(bodyMarkdown);
      return `
        <div class="reasoning-section">
          <div class="reasoning-title"><span class="reasoning-icon">${icon}</span><span>${escapeHtml(section.title)}</span></div>
          <div class="reasoning-body">${bodyHTML}</div>
        </div>
      `;
    })
    .join('');
  return `<div class="reasoning-bubble">${sectionsHTML}</div>`;
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

  const historyData = [];
  characters.forEach((char) => {
    const currentMsgs = conversations[char.id] || [];
    if (currentMsgs.length) {
      const last = currentMsgs[currentMsgs.length - 1];
      historyData.push({ type: 'current', char, sessionId: 'current', lastMsg: last, lastTs: last.timestamp });
    }
    (archivedSessions[char.id] || []).forEach((s) => {
      const lm = s.messages[s.messages.length - 1];
      historyData.push({ type: 'archived', char, sessionId: s.id, lastMsg: lm, lastTs: lm?.timestamp || 0 });
    });
  });
  historyData.sort((a, b) => b.lastTs - a.lastTs);

  historyData.forEach((itemObj) => {
    const { char, type, sessionId, lastMsg, lastTs } = itemObj;
    const timeLabel = lastTs ? formatRelativeTime(lastTs) : '';
    const previewText = lastMsg ? lastMsg.text : (type === 'archived' ? '历史会话' : '暂无对话');

    // 搜索过滤：按人物名或最后一句话匹配
    if (keyword && !(char.name.toLowerCase().includes(keyword) || previewText.toLowerCase().includes(keyword))) {
      return;
    }

    const item = document.createElement('div');
    item.className = 'history-item';
    item.onclick = () => {
      if (type === 'archived') {
        loadArchivedSession(char.id, sessionId);
      } else {
        viewingArchived = null;
        selectCharacter(char.id);
      }
    };

    item.innerHTML = `
      <div class="history-main">
        <div class="history-title">
          <span class="history-name">${previewText}</span>
          <span class="history-time">${timeLabel}</span>
        </div>
      </div>
      <button class="history-del-btn" title="删除" aria-label="删除">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
          <path d="M10 11v6"></path>
          <path d="M14 11v6"></path>
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
        </svg>
      </button>
    `;

    const delBtn = item.querySelector('.history-del-btn');
    delBtn.onclick = (e) => {
      e.stopPropagation();
      deleteHistoryItem(char.id, type, sessionId);
    };

    listContainer.appendChild(item);
  });
}

function loadArchivedSession(charId, sessionId) {
  const messagesContainer = document.getElementById('chatMessages');
  if (!messagesContainer) return;
  messagesContainer.innerHTML = '';
  const session = (archivedSessions[charId] || []).find((s) => s.id === sessionId);
  if (!session) return;
  viewingArchived = { charId, sessionId };
  session.messages.forEach((m) => addMessageToUI(m));
  // 不修改标题后缀，保持与当前会话一致
}

function deleteHistoryItem(charId, type, sessionId) {
  const ok = window.confirm('确定删除该对话吗？删除后无法恢复');
  if (!ok) return;
  if (type === 'archived') {
    archivedSessions[charId] = (archivedSessions[charId] || []).filter((s) => s.id !== sessionId);
    if (viewingArchived && viewingArchived.charId === charId && viewingArchived.sessionId === sessionId) {
      viewingArchived = null;
      const messagesContainer = document.getElementById('chatMessages');
      if (messagesContainer) messagesContainer.innerHTML = '';
    }
  } else {
    conversations[charId] = [];
    if (!viewingArchived && currentCharacter && currentCharacter.id === charId) {
      const messagesContainer = document.getElementById('chatMessages');
      if (messagesContainer) messagesContainer.innerHTML = '';
    }
  }
  renderHistoryList();
}

function renderCharacterSwitcher() {
  // 兼容保留：不再使用顶部横向切换，改为下拉列表
}

function renderCharacterDropdown() {
  const dropdown = document.getElementById('roleDropdown');
  if (!dropdown) return;
  dropdown.innerHTML = '';

  const activeId = currentCharacter?.id;
  characters.forEach((char) => {
    const item = document.createElement('div');
    item.className = `model-item ${activeId && char.id === activeId ? 'active' : ''}`;
    const avatarMarkup = getCharacterAvatarMarkup(char, 36);
    item.innerHTML = `
      <div class=\"avatar\">${avatarMarkup}</div>
      <div class=\"name\">${escapeHtml(char.name)}</div>
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
    const isActive = currentCharacter && char.id === currentCharacter.id;
    item.className = `character-item ${isActive ? 'active' : ''}`;
    item.onclick = () => selectCharacter(char.id);

    const avatarMarkup = getCharacterAvatarMarkup(char);
    item.innerHTML = `
      <div class="character-header">
        <div class="character-avatar">${avatarMarkup}</div>
        <div class="character-name">${escapeHtml(char.name)}</div>
      </div>
      <div class="character-desc">${escapeHtml(char.description)}</div>
      <div style="font-size: 10px; color: #8b4513; margin-top: 5px;">
        最后对话：${escapeHtml(char.lastActive)}
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

    const avatarMarkup = getCharacterAvatarMarkup(char, 60);
    card.innerHTML = `
      <div class="character-avatar" style="width: 60px; height: 60px;">${avatarMarkup}</div>
      <div class="character-card-info">
        <h3>${escapeHtml(char.name)}</h3>
        <p>描述：${escapeHtml(char.description)}</p>
        <p>性格：${escapeHtml(char.personality)}</p>
        ${char.background ? `<p>背景：${escapeHtml(char.background)}</p>` : ''}
        ${char.responseFormat ? `<p>回答格式：${escapeHtml(char.responseFormat)}</p>` : ''}
        <div class="meta">创建时间：${escapeHtml(char.createdAt)}</div>
      </div>
      <div class="character-actions">
        <button class="btn btn-small btn-edit" onclick="editCharacter(${char.id})">编辑</button>
        <button class="btn btn-small btn-delete" onclick="deleteCharacter(${char.id})">删除</button>
      </div>
    `;

    container.appendChild(card);
  });
}

function updateCurrentCharacterHeader() {
  const avatarEl = document.getElementById('currentCharacterAvatar');
  const nameEl = document.getElementById('currentCharacterName');
  if (!currentCharacter) {
    if (avatarEl) avatarEl.innerHTML = getCharacterAvatarMarkup(null, 48);
    if (nameEl) nameEl.textContent = '';
    return;
  }
  if (avatarEl) avatarEl.innerHTML = getCharacterAvatarMarkup(currentCharacter, 48);
  if (nameEl) nameEl.textContent = currentCharacter.name;
}

function selectCharacter(characterId) {
  const nextCharacter = characters.find((char) => char.id === characterId);
  if (!nextCharacter) return;
  currentCharacter = nextCharacter;
  renderCharacterList();
  renderCharacterDropdown();
  loadConversation(characterId);
  updateCurrentCharacterHeader();
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

  const avatarHTML = message.type === 'ai'
    ? getCharacterAvatarMarkup(currentCharacter, 36)
    : `<div class="avatar-chip" style="width:36px;height:36px;">${pixelUserSVG()}</div>`;

  // 连续消息合并：如果上一条是同一侧，则标记为连续
  const last = messagesContainer.lastElementChild;
  const isGrouped = last && last.classList.contains(message.type);
  if (isGrouped) {
    messageDiv.classList.add('grouped');
  }

  if (message.type === 'ai') {
    messageDiv.innerHTML = `
      <div class="message-avatar">${avatarHTML}</div>
      <div class="message-content"><div class="message-text"></div></div>
      <div class="message-time outside">${message.time}</div>
    `;
    // Markdown 渲染
    try {
      const target = messageDiv.querySelector('.message-text');
      if (target) {
        const reasoning = renderReasoningHTML(message.text);
        if (reasoning) {
          messageDiv.classList.add('ai-reasoning');
          target.innerHTML = reasoning;
        } else {
          target.innerHTML = renderMarkdown(message.text);
        }
      }
    } catch (e) {
      messageDiv.querySelector('.message-text').textContent = message.text;
    }
  } else {
    // 用户消息：时间在左侧，气泡在右侧
  messageDiv.innerHTML = `
      <div class="message-time outside">${message.time}</div>
      <div class="message-content"><div class="message-text"></div></div>
      <div class="message-avatar">${avatarHTML}</div>
    `;
    const target = messageDiv.querySelector('.message-text');
    target.textContent = message.text; // 用户消息不做 markdown
  }

  messagesContainer.appendChild(messageDiv);
}

function sendMessage() {
  if (!currentCharacter) return;
  if (isAwaitingResponse) return; // 正在等待回复时禁止发送
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

  // 若正在查看历史会话，则跳回当前会话
  viewingArchived = null;
  conversations[currentCharacter.id] = conversations[currentCharacter.id] || [];
  conversations[currentCharacter.id].push(userMessage);
  addMessageToUI(userMessage);
  input.value = '';

  bumpCurrentCharacterActivity();

  // 进入等待状态并插入“等待回复”气泡
  setSendingState(true);
  const messagesContainer = document.getElementById('chatMessages');
  const typingDiv = document.createElement('div');
  typingDiv.className = 'message ai typing';
  typingDiv.innerHTML = `
    <div class="message-avatar">${getCharacterAvatarMarkup(currentCharacter, 36)}</div>
    <div class="message-content"><div class="typing-dots"><span></span><span></span><span></span></div></div>
  `;
  messagesContainer.appendChild(typingDiv);

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
      // 移除等待回复
      typingDiv.remove();
    conversations[currentCharacter.id].push(aiMessage);
    addMessageToUI(aiMessage);
    const messagesContainer = document.getElementById('chatMessages');
      if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
      bumpCurrentCharacterActivity();
      setSendingState(false);
    };

    const chatMessagesPayload = buildChatMessages(text, currentCharacter);

    if (localStorage.getItem('dev_enabled') === 'true') {
      loadAppConfig().then(() => {
        // 将 admin 保存的 base 覆盖到 appConfig.dev
        appConfig.dev = appConfig.dev || {};
        appConfig.dev.enabled = true;
        appConfig.dev.llmBase = localStorage.getItem('dev_llm_base') || appConfig.dev.llmBase;
        localStorage.getItem('dev_api_key');
        // 流式输出
        let acc = '';
        callTextLLMDevStream(
          chatMessagesPayload,
          (delta) => {
            acc += delta;
            const contentBox = typingDiv.querySelector('.message-content');
            if (contentBox) contentBox.innerHTML = acc;
            const mc = document.getElementById('chatMessages');
            if (mc) mc.scrollTop = mc.scrollHeight; // 流式期间保持滚动到底
          },
          () => {
            writeAI(acc || '');
          },
          (err) => {
            const reason = (typeof err === 'string') ? err : (err?.message || '未知错误');
            writeAI(`调用失败：${reason}`);
          }
        );
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

// 轻量 Markdown 渲染（适配标题/列表/代码块/链接/粗斜体/引用/段落）
function renderMarkdown(src) {
  if (!src) return '';
  // 先整体转义
  let text = src.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 代码块 ```lang\ncode\n```
  const codeBlocks = [];
  text = text.replace(/```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, (_, lang, code) => {
    const id = `__CODE_${codeBlocks.length}__`;
    codeBlocks.push(`<pre><code class="lang-${lang || 'plain'}">${code}</code></pre>`);
    return id;
  });

  // 标题
  text = text.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
             .replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
             .replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
             .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
             .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
             .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // 引用 > text
  text = text.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');

  // 有序/无序列表
  // 无序
  text = text.replace(/^(?:\-|\*)\s+(.+)$/gm, '<li>$1</li>');
  text = text.replace(/(?:<li>.*<\/li>\n?)+/gs, (m) => `<ul>${m}</ul>`);
  // 有序 1. item
  text = text.replace(/^(\d+)\.\s+(.+)$/gm, '<li>$2</li>');
  text = text.replace(/(?:<li>.*<\/li>\n?)+/gs, (m) => m.startsWith('<ul>') ? m : `<ol>${m}</ol>`);

  // 链接 [text](url)
  text = text.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // 行内代码 `code`
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  // 粗体/斜体
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

  // 分隔线 --- 或 ***
  text = text.replace(/^(-{3,}|\*{3,})$/gm, '<hr/>');

  // 段落：两行之间空行
  text = text.replace(/(^|\n)(?!<(h\d|ul|ol|li|pre|blockquote|hr|p|code))([^\n]+)(?=\n|$)/g, (m, p1, _tag, content) => `${p1}<p>${content}</p>`);

  // 回填代码块占位
  codeBlocks.forEach((html, i) => {
    text = text.replace(`__CODE_${i}__`, html);
  });
  return text;
}

// 前端直连（无后端）调用演示：仅用于开发自测
async function callTextLLMDev(messages) {
  if (!appConfig?.dev?.enabled) {
    console.warn('dev 直连未启用');
    return '（本地直连未启用）';
  }
  const base = appConfig.dev.llmBase;
  const key = localStorage.getItem('dev_api_key') || '';
  const model = localStorage.getItem('cfg_llm_model') || (appConfig.defaults?.llm?.[0] || '');
  if (!base || !key || !model) return '（请在 Admin 页或本地存储中配置 dev_api_key/模型）';
  const payloadMessages = Array.isArray(messages) && messages.length ? messages : [{ role: 'user', content: typeof messages === 'string' ? messages : '' }];

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [appConfig.dev.authHeader || 'Authorization']: `${appConfig.dev.authScheme || 'Bearer'} ${key}`
      },
      body: JSON.stringify({ model, messages: payloadMessages })
    });
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || JSON.stringify(data);
    return text;
  } catch (e) {
    return `调用失败：${e?.message || e}`;
  }
}

// 流式（SSE）输出
async function callTextLLMDevStream(messages, onDelta, onDone, onError) {
  const controller = new AbortController();
  const INACTIVITY_TIMEOUT_MS = 20000; // 20s 无增量则视为卡住
  const HARD_TIMEOUT_MS = 120000; // 2 分钟硬超时
  let inactivityTimer = null;
  let hardTimer = null;
  const resetInactivity = () => {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
      controller.abort('idle-timeout');
    }, INACTIVITY_TIMEOUT_MS);
  };
  const clearTimers = () => {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    if (hardTimer) clearTimeout(hardTimer);
    inactivityTimer = null;
    hardTimer = null;
  };
  try {
    const base = localStorage.getItem('dev_llm_base') || appConfig?.dev?.llmBase;
    const key = localStorage.getItem('dev_api_key') || '';
    const model = localStorage.getItem('cfg_llm_model') || (appConfig.defaults?.llm?.[0] || '');
    const payloadMessages = Array.isArray(messages) && messages.length ? messages : [{ role: 'user', content: typeof messages === 'string' ? messages : '' }];
    if (!base || !key || !model) throw new Error('缺少 base/key/model');

    const authHeaderName = (appConfig?.dev?.authHeader) || 'Authorization';
    const authScheme = (appConfig?.dev?.authScheme) || 'Bearer';

    hardTimer = setTimeout(() => controller.abort('hard-timeout'), HARD_TIMEOUT_MS);
    resetInactivity();

    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        [authHeaderName]: `${authScheme} ${key}`
      },
      body: JSON.stringify({ model, stream: true, messages: payloadMessages }),
      signal: controller.signal
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      resetInactivity();
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\r?\n\r?\n/); // 兼容 CRLF
      buffer = parts.pop();
      for (const part of parts) {
        const lines = part.split(/\r?\n/).filter(Boolean);
        for (const raw of lines) {
          const line = raw.replace(/\r$/, '');
          const m = line.match(/^data:\s*(.*)$/);
          if (!m) continue;
          const data = (m[1] || '').trim();
          if (data === '[DONE]') { clearTimers(); onDone && onDone(); return; }
          try {
            const json = JSON.parse(data);
            const piece = json?.choices?.[0]?.delta?.content || json?.choices?.[0]?.message?.content || '';
            if (piece) onDelta && onDelta(piece);
          } catch (e) {
            // 非 JSON 内容忽略
          }
        }
      }
    }
    clearTimers();
    onDone && onDone();
  } catch (e) {
    clearTimers();
    onError && onError(e);
  }
}

function handleKeyPress(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    if (!isAwaitingResponse) {
    sendMessage();
    }
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
  const llm = parse('visible_llm_models', envLlm).filter(Boolean);
  const asr = parse('visible_asr_models', envAsr).filter(Boolean);
  const ttsVoices = parse('visible_tts_voices', envTts).filter(Boolean);
  const voiceModels = parse('visible_voice_models', envVrm).filter(Boolean);
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

  // 无后端：尝试从 dev 模型端点自动拉取（需要 dev_enabled=true 且配置了 base/key）
  if (localStorage.getItem('dev_enabled') === 'true') {
    const base = localStorage.getItem('dev_llm_base') || appConfig?.dev?.llmBase;
    const key = localStorage.getItem('dev_api_key');
    const ep = appConfig?.dev?.modelsEndpoint || '/models';
    if (base && key) {
      fetch(`${base}${ep}`, {
        headers: {
          [appConfig?.dev?.authHeader || 'Authorization']:
            `${appConfig?.dev?.authScheme || 'Bearer'} ${key}`
        }
      })
        .then((r) => r.json())
        .then((json) => {
          // 兼容 OpenAI 格式：{ data: [ {id,object} ] }
          const ids = Array.isArray(json?.data)
            ? json.data.map((m) => m.id).filter(Boolean)
            : (json?.models || []);
          if (ids.length) {
            // LLM 成功
            const lists = { llm: ids, asr: [], ttsVoices: [], voiceModels: [] };
            const fetchOptional = async (field, endpoint) => {
              if (!endpoint) return [];
              try {
                const r = await fetch(`${base}${endpoint}`, {
                  headers: { [appConfig?.dev?.authHeader || 'Authorization']: `${appConfig?.dev?.authScheme || 'Bearer'} ${key}` }
                });
                const j = await r.json();
                if (Array.isArray(j?.data)) return j.data.map((x) => x.id || x.name).filter(Boolean);
                return j?.items || j?.models || [];
              } catch { return []; }
            };
            const asrBase = localStorage.getItem('dev_asr_base') || base;
            const asrKey = localStorage.getItem('dev_asr_key') || key;
            const ttsBase = localStorage.getItem('dev_tts_base') || base;
            const ttsKey = localStorage.getItem('dev_tts_key') || key;
            const vrmBase = localStorage.getItem('dev_vrm_base') || base;
            const vrmKey = localStorage.getItem('dev_vrm_key') || key;

            const fetchFrom = (b, k, ep) => {
              if (!ep || !b || !k) return Promise.resolve([]);
              return fetch(`${b}${ep}`, {
                headers: { [appConfig?.dev?.authHeader || 'Authorization']: `${appConfig?.dev?.authScheme || 'Bearer'} ${k}` }
              })
                .then((r) => r.json())
                .then((j) => (Array.isArray(j?.data) ? j.data.map((x) => x.id || x.name).filter(Boolean) : (j?.items || j?.models || [])))
                .catch(() => []);
            };

            Promise.all([
              fetchFrom(asrBase, asrKey, appConfig?.dev?.asrModelsEndpoint),
              fetchFrom(ttsBase, ttsKey, appConfig?.dev?.ttsVoicesEndpoint),
              fetchFrom(vrmBase, vrmKey, appConfig?.dev?.voiceModelsEndpoint)
            ]).then(([asrL, ttsL, vrmL]) => {
              lists.asr = asrL; lists.ttsVoices = ttsL; lists.voiceModels = vrmL;
              populate(lists);
            });
          }
        })
        .catch(() => {});
    }
  }
}

function showAddCharacterModal() {
  editingCharacterId = null;
  const modalTitle = document.getElementById('modalTitle');
  modalTitle.textContent = '添加新人物';
  const form = document.getElementById('characterForm');
  form.reset();
  prepareAvatarControls(null);
  document.getElementById('characterModal').style.display = 'block';
}

function editCharacter(characterId) {
  const character = characters.find((char) => char.id === characterId);
  if (!character) return;

  editingCharacterId = characterId;
  document.getElementById('modalTitle').textContent = '编辑人物';
  document.getElementById('characterName').value = character.name;
  document.getElementById('characterDesc').value = character.description;
  document.getElementById('characterPersonality').value = character.personality;
  document.getElementById('characterBackground').value = character.background || '';
  document.getElementById('characterFormat').value = character.responseFormat || '';
  document.getElementById('characterOpening').value = character.openingMessage || '';
  prepareAvatarControls(character);
  document.getElementById('characterModal').style.display = 'block';
}

function deleteCharacter(characterId) {
  if (!confirm('确定要删除这个人物吗？')) return;

  characters = characters.filter((char) => char.id !== characterId);
  delete conversations[characterId];

  if (currentCharacter && currentCharacter.id === characterId && characters.length > 0) {
    currentCharacter = characters[0];
  } else if (!characters.length) {
    currentCharacter = null;
  }

  saveCharacters(characters);

  renderCharacterList();
  renderCharacterManagement();
  updateStats();

  if (characters.length > 0 && currentCharacter) {
    loadConversation(currentCharacter.id);
    updateCurrentCharacterHeader();
  } else {
    updateCurrentCharacterHeader();
    const messagesContainer = document.getElementById('chatMessages');
    if (messagesContainer) messagesContainer.innerHTML = '';
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
  if (!currentCharacter) return;
  const character = characters.find((c) => c.id === currentCharacter.id);
  if (character) {
    character.lastActive = '刚刚';
    character.conversationCount = (character.conversationCount || 0) + 1;
    saveCharacters(characters);
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

async function startVoiceInput() {
  if (voiceInputState.processing) return;
  if (voiceInputState.isRecording) {
    stopVoiceInput(false);
    return;
  }
  updateVoiceButton();
  if (startWebSpeechRecognition()) return;
  await startMediaRecorderFlow();
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
  if (currentCharacter) {
    loadConversation(currentCharacter.id);
  }
  updateCurrentCharacterHeader();
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

  document.querySelectorAll('.avatar-mode-btn')?.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-avatar-mode');
      if (mode) switchAvatarMode(mode);
    });
  });

  const emojiInput = document.getElementById('characterEmoji');
  emojiInput?.addEventListener('input', (event) => {
    avatarFormState.emoji = event.target.value;
    updateAvatarPreview();
  });

  const urlInput = document.getElementById('characterAvatarUrl');
  urlInput?.addEventListener('input', (event) => {
    avatarFormState.url = event.target.value;
    updateAvatarPreview();
  });

  const fileInput = document.getElementById('characterAvatarFile');
  fileInput?.addEventListener('change', handleAvatarFileChange);

  // 固定浅色主题
  document.body.setAttribute('data-theme', 'light');
  localStorage.setItem('theme', 'light');

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
      description: document.getElementById('characterDesc').value,
      personality: document.getElementById('characterPersonality').value,
      background: document.getElementById('characterBackground').value,
      responseFormat: document.getElementById('characterFormat').value,
      openingMessage: document.getElementById('characterOpening').value
    };

    const avatarResult = getAvatarFormResult();
    formData.icon = avatarResult.icon || formData.icon || '🧑';
    formData.avatarType = avatarResult.avatarType;
    formData.avatarUrl = avatarResult.avatarUrl;

    if (editingCharacterId) {
      const character = characters.find((char) => char.id === editingCharacterId);
      if (character) {
        Object.assign(character, formData);
        const convo = conversations[character.id];
        if (convo && convo.length) {
          convo[0] = createOpeningMessage(character, convo[0].timestamp || Date.now());
        }
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
      conversations[newCharacter.id] = [createOpeningMessage(newCharacter)];
      currentCharacter = newCharacter;
      editingCharacterId = null;
    }

    saveCharacters(characters);

    renderCharacterList();
    renderHistoryList();
    renderCharacterManagement();
    if (currentCharacter) {
      loadConversation(currentCharacter.id);
    }
    updateCurrentCharacterHeader();
    updateStats();
    closeCharacterModal();
    editingCharacterId = null;
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
window.startVoiceInput = startVoiceInput;
window.setTheme = (theme) => {
  document.body.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
};

// 新建对话：为当前人物创建一条空会话并切换到该人物
window.newConversation = () => {
  if (!currentCharacter) return;
  const cid = currentCharacter.id;
  // 若当前是历史会话视图，则回到“当前会话”再新建
  if (viewingArchived && viewingArchived.charId === cid) viewingArchived = null;

  const currentMsgs = conversations[cid] || [];
  archivedSessions[cid] = archivedSessions[cid] || [];
  // 仅当当前会话非空时才归档
  if (currentMsgs && currentMsgs.length > 0) {
    archivedSessions[cid].push({ id: `${cid}-${Date.now()}`, messages: currentMsgs });
  }
  // 创建新的会话并写入开场发言
  conversations[cid] = [createOpeningMessage(currentCharacter)];
  viewingArchived = null;
  loadConversation(cid);
  renderHistoryList();
};

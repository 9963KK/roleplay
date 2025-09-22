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

    const item = document.createElement('div');
    item.className = `history-item ${char.id === currentCharacter.id ? 'active' : ''}`;
    item.onclick = () => selectCharacter(char.id);

    item.innerHTML = `
      <div class="history-avatar">${char.icon}</div>
      <div class="history-main">\
        <div class="history-title">\
          <span class="history-name">${char.name}</span>\
          <span class="history-time">${timeLabel}</span>\
        </div>\
        <div class="history-desc">${char.description || ''}</div>\
        <div class="history-preview">${previewText}</div>\
      </div>\
    `;

    listContainer.appendChild(item);
  });
}

function renderCharacterSwitcher() {
  // 兼容保留：不再使用顶部横向切换，改为下拉列表
}

function renderCharacterDropdown() {
  const dropdown = document.getElementById('characterDropdown');
  if (!dropdown) return;
  dropdown.innerHTML = '';

  characters.forEach((char) => {
    const item = document.createElement('div');
    item.className = `dropdown-item ${char.id === currentCharacter.id ? 'active' : ''}`;
    item.innerHTML = `
      <div class=\"dropdown-avatar\">${char.icon}</div>
      <div class=\"dropdown-name\">${char.name}</div>
    `;
    item.onclick = () => {
      selectCharacter(char.id);
      hideCharacterDropdown();
    };
    dropdown.appendChild(item);
  });
}

function toggleCharacterDropdown() {
  const dropdown = document.getElementById('characterDropdown');
  if (!dropdown) return;
  if (dropdown.classList.contains('hidden')) {
    renderCharacterDropdown();
    dropdown.classList.remove('hidden');
  } else {
    dropdown.classList.add('hidden');
  }
}

function hideCharacterDropdown() {
  const dropdown = document.getElementById('characterDropdown');
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
        <div class="character-avatar">${char.icon}</div>
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
  renderHistoryList();
  renderCharacterDropdown();
  loadConversation(characterId);

  const avatar = document.getElementById('currentCharacterAvatar');
  const name = document.getElementById('currentCharacterName');
  if (avatar) avatar.textContent = currentCharacter.icon;
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

  const avatar = message.type === 'ai' ? currentCharacter.icon : '👤';

  messageDiv.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div class="message-content">
      ${message.type === 'ai' ? `<div class="message-author">${message.author}</div>` : ''}
      <div class="message-text">${message.text}</div>
      <div class="message-time">${message.time}</div>
    </div>
  `;

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
    const aiTs = Date.now();
    const aiMessage = {
      type: 'ai',
      author: currentCharacter.name,
      text: generateAIResponse(text, currentCharacter),
      time: formatClock(aiTs),
      timestamp: aiTs
    };

    conversations[currentCharacter.id].push(aiMessage);
    addMessageToUI(aiMessage);

    const messagesContainer = document.getElementById('chatMessages');
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    bumpCurrentCharacterActivity();
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
  document.querySelectorAll('.menu-item').forEach((item) => {
    item.classList.remove('active');
  });

  event.currentTarget.classList.add('active');
  // 预留：根据 tab 值切换不同的设置内容
  console.log('切换到标签页:', tab);
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

document.addEventListener('DOMContentLoaded', () => {
  initializeCharacters();
  initializeConversations();
  renderCharacterList();
  renderHistoryList();
  renderCharacterDropdown();
  renderCharacterManagement();
  loadConversation(currentCharacter.id);
  updateStats();

  const avatarEl = document.getElementById('currentCharacterAvatar');
  avatarEl?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleCharacterDropdown();
  });

  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('characterDropdown');
    if (!dropdown || dropdown.classList.contains('hidden')) return;
    const avatar = document.getElementById('currentCharacterAvatar');
    if (dropdown.contains(e.target) || avatar?.contains(e.target)) return;
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
    renderCharacterManagement();
    updateStats();
    closeCharacterModal();
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

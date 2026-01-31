// TTS Web App - Application Logic

// State
let allVoices = { preset: [], custom: [] };
let selectedVoice = null;
let selectedModel = '0.6B';
let mediaRecorder = null;
let recordedBlob = null;
let recordingInterval = null;
let autoplay = localStorage.getItem('tts-autoplay') !== 'false'; // Default: true
let progressInterval = null;

// DOM Elements
const voiceSelect = document.getElementById('voiceSelect');
const styleSelect = document.getElementById('styleSelect');
const textInput = document.getElementById('textInput');
const generateBtn = document.getElementById('generateBtn');
const audioPlayer = document.getElementById('audioPlayer');
const audioElement = document.getElementById('audioElement');
const status = document.getElementById('status');
const voiceDesignTextarea = document.getElementById('voiceDesignText');

// Progress elements
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressStatus = document.getElementById('progressStatus');
const progressPercent = document.getElementById('progressPercent');
const autoplayToggle = document.getElementById('autoplayToggle');

// Modal Elements
const modalOverlay = document.getElementById('modalOverlay');
const savedVoicesContainer = document.getElementById('savedVoicesContainer');
const recordBtn = document.getElementById('recordBtn');
const recordTimer = document.getElementById('recordTimer');
const recordStatus = document.getElementById('recordStatus');
const uploadDropzone = document.getElementById('uploadDropzone');
const uploadInput = document.getElementById('uploadInput');
const saveVoiceForm = document.getElementById('saveVoiceForm');
const voiceNameInput = document.getElementById('voiceNameInput');
const refTextInput = document.getElementById('refTextInput');
const saveVoiceBtn = document.getElementById('saveVoiceBtn');

// Constants
const RECORD_SCRIPT = "The quick brown fox jumps over the lazy dog. I really enjoy testing new technology, especially when it works smoothly on my computer.";
const RECORD_DURATION = 10;

// Style presets
const stylePresets = [
  { id: '', label: 'None' },
  { id: 'professional', label: 'Professional', value: 'Speak in a professional, clear, and confident tone with measured pacing.' },
  { id: 'news', label: 'News Anchor', value: 'Speak like a news anchor - authoritative, clear enunciation, neutral but engaging.' },
  { id: 'friendly', label: 'Friendly', value: 'Speak warmly and conversationally, like talking to a friend.' },
  { id: 'storyteller', label: 'Storyteller', value: 'Narrate like an audiobook storyteller - expressive, varied pacing, engaging.' },
  { id: 'excited', label: 'Excited', value: 'Speak with high energy and excitement, enthusiastic and upbeat.' },
  { id: 'dramatic', label: 'Dramatic', value: 'Speak dramatically with intense emotion, theatrical pauses, and powerful delivery.' },
  { id: 'epic', label: 'Epic/Trailer', value: 'Maximum dramatic intensity - deep gravitas, epic movie trailer style, commanding presence.' },
  { id: 'calm', label: 'Calm/Soft', value: 'Speak softly and gently, calm and soothing like a meditation guide.' },
  { id: 'sad', label: 'Sad', value: 'Speak slowly and sadly, with a melancholic and reflective tone.' },
  { id: 'whisper', label: 'Whisper', value: 'Whisper softly and mysteriously.' },
  { id: 'custom', label: 'Custom...' }
];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadVoices();
  initializeStyles();
  initializeModelToggle();
  initializeModal();
  initializeRecording();
  initializeUpload();
  initializeGenerate();
  initializeAutoplay();
});

// Initialize autoplay toggle
function initializeAutoplay() {
  // Set initial state
  if (autoplay) {
    autoplayToggle.classList.add('active');
  } else {
    autoplayToggle.classList.remove('active');
  }

  // Toggle handler
  autoplayToggle.addEventListener('click', () => {
    autoplay = !autoplay;
    localStorage.setItem('tts-autoplay', autoplay);
    autoplayToggle.classList.toggle('active', autoplay);
  });
}

// Load all voices from API
async function loadVoices() {
  try {
    const response = await fetch('/api/all-voices');
    const data = await response.json();
    allVoices = data;
    populateVoiceDropdown();
  } catch (error) {
    console.error('Failed to load voices:', error);
    showStatus('error', 'Failed to load voices');
  }
}

// Populate voice dropdown with grouped options
function populateVoiceDropdown() {
  voiceSelect.innerHTML = '';

  // My Voices group
  if (allVoices.custom && allVoices.custom.length > 0) {
    const customGroup = document.createElement('optgroup');
    customGroup.label = 'My Voices';
    allVoices.custom.forEach(voice => {
      const option = document.createElement('option');
      option.value = `custom:${voice.id}`;
      option.textContent = voice.name;
      customGroup.appendChild(option);
    });
    voiceSelect.appendChild(customGroup);
  }

  // Group preset voices by language
  const presetsByLang = {};
  if (allVoices.preset) {
    allVoices.preset.forEach(voice => {
      const lang = voice.language || 'Other';
      if (!presetsByLang[lang]) {
        presetsByLang[lang] = [];
      }
      presetsByLang[lang].push(voice);
    });
  }

  // Add preset groups
  Object.entries(presetsByLang).forEach(([lang, voices]) => {
    const group = document.createElement('optgroup');
    group.label = `Preset - ${lang}`;
    voices.forEach(voice => {
      const option = document.createElement('option');
      option.value = `preset:${voice.id}`;
      option.textContent = `${voice.name} - ${voice.description}`;
      group.appendChild(option);
    });
    voiceSelect.appendChild(group);
  });

  // Select first voice
  if (voiceSelect.options.length > 0) {
    voiceSelect.selectedIndex = 0;
    selectedVoice = parseVoiceValue(voiceSelect.value);
  }

  // Handle voice change
  voiceSelect.addEventListener('change', () => {
    selectedVoice = parseVoiceValue(voiceSelect.value);
  });
}

// Parse voice value (e.g., "custom:my_voice" or "preset:Ryan")
function parseVoiceValue(value) {
  const [type, id] = value.split(':');
  return { type, id };
}

// Initialize style dropdown
function initializeStyles() {
  stylePresets.forEach(style => {
    const option = document.createElement('option');
    option.value = style.id;
    option.textContent = style.label;
    if (style.value) {
      option.dataset.instruction = style.value;
    }
    styleSelect.appendChild(option);
  });

  // Handle custom style input
  const customStyleContainer = document.getElementById('customStyleContainer');
  const customStyleInput = document.getElementById('customStyleInput');

  styleSelect.addEventListener('change', () => {
    if (styleSelect.value === 'custom') {
      customStyleContainer.style.display = 'block';
      customStyleInput.focus();
    } else {
      customStyleContainer.style.display = 'none';
    }
  });
}

// Get selected style instruction
function getStyleInstruction() {
  if (styleSelect.value === 'custom') {
    return document.getElementById('customStyleInput').value;
  }
  const selected = styleSelect.options[styleSelect.selectedIndex];
  return selected.dataset.instruction || '';
}

// Initialize model toggle
function initializeModelToggle() {
  const modelBtns = document.querySelectorAll('.model-btn');
  modelBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modelBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedModel = btn.dataset.model;
    });
  });
}

// Modal functions
function initializeModal() {
  const voiceSetupBtn = document.getElementById('voiceSetupBtn');
  const modalClose = document.getElementById('modalClose');

  voiceSetupBtn.addEventListener('click', openModal);
  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // Escape key closes modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay.classList.contains('visible')) {
      closeModal();
    }
  });
}

function openModal() {
  modalOverlay.classList.add('visible');
  document.body.style.overflow = 'hidden';
  renderSavedVoices();
}

function closeModal() {
  modalOverlay.classList.remove('visible');
  document.body.style.overflow = '';
  resetRecordingState();
  resetUploadState();
}

// Render saved voices in modal
function renderSavedVoices() {
  if (!allVoices.custom || allVoices.custom.length === 0) {
    savedVoicesContainer.innerHTML = '<span class="no-voices-message">No saved voices yet</span>';
    return;
  }

  savedVoicesContainer.innerHTML = allVoices.custom.map(voice => `
    <div class="voice-chip" data-voice-id="${voice.id}">
      <span class="voice-name">${voice.name}</span>
      <div class="voice-actions">
        <button class="action-btn rename-btn" data-id="${voice.id}" data-name="${voice.name}" title="Rename">R</button>
        <button class="action-btn delete-btn" data-id="${voice.id}" title="Delete">X</button>
      </div>
    </div>
  `).join('');

  // Add event listeners
  savedVoicesContainer.querySelectorAll('.rename-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleRenameVoice(btn.dataset.id, btn.dataset.name);
    });
  });

  savedVoicesContainer.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDeleteVoice(btn.dataset.id);
    });
  });
}

async function handleRenameVoice(id, currentName) {
  const newName = prompt('Enter new name:', currentName);
  if (newName && newName !== currentName) {
    try {
      const response = await fetch(`/api/voices/${id}/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName })
      });
      if (response.ok) {
        await loadVoices();
        renderSavedVoices();
      }
    } catch (error) {
      alert('Failed to rename voice');
    }
  }
}

async function handleDeleteVoice(id) {
  if (confirm('Delete this voice?')) {
    try {
      await fetch(`/api/voices/${id}`, { method: 'DELETE' });
      await loadVoices();
      renderSavedVoices();
    } catch (error) {
      alert('Failed to delete voice');
    }
  }
}

// Recording functionality
function initializeRecording() {
  recordBtn.addEventListener('click', toggleRecording);
}

async function toggleRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    stopRecording();
  } else {
    startRecording();
  }
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    const audioChunks = [];

    mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);

    mediaRecorder.onstop = async () => {
      clearInterval(recordingInterval);
      stream.getTracks().forEach(track => track.stop());

      recordedBlob = new Blob(audioChunks, { type: 'audio/wav' });

      // Upload the recording
      const formData = new FormData();
      formData.append('audio', recordedBlob, 'recording.wav');

      try {
        const response = await fetch('/api/upload-reference', {
          method: 'POST',
          body: formData
        });

        if (response.ok) {
          recordBtn.className = 'btn-record complete';
          recordBtn.innerHTML = '<span>Recording Complete</span>';
          recordStatus.textContent = 'Voice recorded successfully';
          recordStatus.style.color = 'var(--accent-success)';

          // Pre-fill reference text
          refTextInput.value = RECORD_SCRIPT;

          // Show save form
          saveVoiceForm.classList.add('visible');
        }
      } catch (error) {
        recordStatus.textContent = 'Failed to upload recording';
        recordStatus.style.color = 'var(--accent-danger)';
      }
    };

    // Start recording
    mediaRecorder.start();
    recordBtn.className = 'btn-record recording';
    recordBtn.innerHTML = '<span>Stop Recording</span>';
    recordTimer.style.display = 'inline';
    recordStatus.textContent = 'Speak now!';
    recordStatus.style.color = 'var(--text-secondary)';

    let seconds = 0;
    recordingInterval = setInterval(() => {
      seconds++;
      recordTimer.textContent = `0:${seconds.toString().padStart(2, '0')}`;
      if (seconds >= RECORD_DURATION) {
        stopRecording();
      }
    }, 1000);

  } catch (error) {
    recordStatus.textContent = 'Microphone access denied';
    recordStatus.style.color = 'var(--accent-danger)';
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
}

function resetRecordingState() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
  recordBtn.className = 'btn-record ready';
  recordBtn.innerHTML = '<span>Start Recording</span>';
  recordTimer.style.display = 'none';
  recordTimer.textContent = '0:00';
  recordStatus.textContent = '';
  recordedBlob = null;
}

// Upload functionality
function initializeUpload() {
  uploadDropzone.addEventListener('click', () => uploadInput.click());

  uploadDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadDropzone.style.borderColor = 'var(--accent-primary)';
  });

  uploadDropzone.addEventListener('dragleave', () => {
    uploadDropzone.style.borderColor = '';
  });

  uploadDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadDropzone.style.borderColor = '';
    if (e.dataTransfer.files.length) {
      uploadInput.files = e.dataTransfer.files;
      handleFileUpload();
    }
  });

  uploadInput.addEventListener('change', handleFileUpload);

  saveVoiceBtn.addEventListener('click', handleSaveVoice);
}

async function handleFileUpload() {
  const file = uploadInput.files[0];
  if (!file) return;

  uploadDropzone.classList.add('has-file');
  uploadDropzone.querySelector('.upload-text').innerHTML = `<strong>${file.name}</strong>`;

  const formData = new FormData();
  formData.append('audio', file);

  try {
    const response = await fetch('/api/upload-reference', {
      method: 'POST',
      body: formData
    });

    if (response.ok) {
      saveVoiceForm.classList.add('visible');
      resetRecordingState();
    } else {
      showStatus('error', 'Failed to upload file');
    }
  } catch (error) {
    showStatus('error', 'Failed to upload file');
  }
}

function resetUploadState() {
  uploadDropzone.classList.remove('has-file');
  uploadDropzone.querySelector('.upload-text').innerHTML = '<strong>Click to upload</strong> or drag and drop';
  uploadInput.value = '';
  saveVoiceForm.classList.remove('visible');
  voiceNameInput.value = '';
  refTextInput.value = '';
}

async function handleSaveVoice() {
  const name = voiceNameInput.value.trim();
  const refText = refTextInput.value.trim();

  if (!name) {
    alert('Please enter a name for this voice');
    return;
  }

  try {
    const response = await fetch('/api/save-voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, refText })
    });

    const data = await response.json();

    if (data.success) {
      await loadVoices();
      renderSavedVoices();
      resetUploadState();
      resetRecordingState();

      // Select the newly saved voice
      voiceSelect.value = `custom:${data.voice.id}`;
      selectedVoice = { type: 'custom', id: data.voice.id };
    } else {
      alert(data.error || 'Failed to save voice');
    }
  } catch (error) {
    alert('Failed to save voice');
  }
}

// Generate speech
function initializeGenerate() {
  generateBtn.addEventListener('click', generateSpeech);

  // Enter key in textarea (with Cmd/Ctrl)
  textInput.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      generateSpeech();
    }
  });
}

// Progress bar animation
function startProgress() {
  progressContainer.classList.add('visible');
  progressFill.style.width = '0%';
  progressPercent.textContent = '0%';
  progressStatus.textContent = 'Initializing...';

  let progress = 0;
  const stages = [
    { at: 10, text: 'Loading model...' },
    { at: 30, text: 'Processing text...' },
    { at: 50, text: 'Generating audio...' },
    { at: 70, text: 'Synthesizing speech...' },
    { at: 85, text: 'Finalizing...' }
  ];

  progressInterval = setInterval(() => {
    // Slow down as we approach 90%
    const increment = progress < 50 ? 2 : progress < 80 ? 1 : 0.3;
    progress = Math.min(progress + increment, 90);

    progressFill.style.width = progress + '%';
    progressPercent.textContent = Math.round(progress) + '%';

    // Update status text
    for (const stage of stages) {
      if (progress >= stage.at) {
        progressStatus.textContent = stage.text;
      }
    }
  }, 100);
}

function completeProgress() {
  clearInterval(progressInterval);
  progressFill.style.width = '100%';
  progressPercent.textContent = '100%';
  progressStatus.textContent = 'Complete!';

  // Hide after a moment
  setTimeout(() => {
    progressContainer.classList.remove('visible');
  }, 500);
}

function hideProgress() {
  clearInterval(progressInterval);
  progressContainer.classList.remove('visible');
}

async function generateSpeech() {
  const text = textInput.value.trim();

  if (!text) {
    showStatus('error', 'Please enter some text');
    return;
  }

  if (!selectedVoice) {
    showStatus('error', 'Please select a voice');
    return;
  }

  generateBtn.disabled = true;
  status.className = 'status'; // Hide any previous status
  startProgress();

  // Check if using voice design (advanced section)
  const voiceDesignText = voiceDesignTextarea ? voiceDesignTextarea.value.trim() : '';
  const useVoiceDesign = voiceDesignText.length > 0;

  // Build payload based on voice type
  const payload = {
    text,
    model: useVoiceDesign ? '1.7B' : selectedModel, // Voice design requires 1.7B
    language: 'Auto'
  };

  if (useVoiceDesign) {
    // Voice Design mode
    payload.mode = 'voice_design';
    payload.voiceDescription = voiceDesignText;
  } else if (selectedVoice.type === 'custom') {
    // Voice Clone mode with saved voice
    payload.mode = 'voice_clone';
    payload.savedVoiceId = selectedVoice.id;
  } else {
    // Custom Voice mode with preset speaker
    payload.mode = 'custom_voice';
    payload.speaker = selectedVoice.id;
    payload.instruct = getStyleInstruction();
  }

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Generation failed');
    }

    completeProgress();

    // Set audio source and play
    audioElement.src = data.audioUrl;
    audioPlayer.classList.add('visible');

    // Autoplay if enabled
    if (autoplay) {
      audioElement.load();
      audioElement.oncanplaythrough = () => {
        audioElement.play().catch(err => {
          console.log('Autoplay blocked:', err);
        });
      };
    }

    showStatus('success', 'Speech generated!');
  } catch (error) {
    hideProgress();
    showStatus('error', error.message);
  } finally {
    generateBtn.disabled = false;
  }
}

// Status display
function showStatus(type, message) {
  status.className = 'status ' + type;
  status.textContent = message;

  // Auto-hide success messages
  if (type === 'success') {
    setTimeout(() => {
      status.className = 'status';
    }, 3000);
  }
}

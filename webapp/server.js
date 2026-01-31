const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cors = require('cors');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, 'reference_audio.wav');
  }
});
const upload = multer({ storage });

// Directory for saved voices
const voicesDir = path.join(__dirname, 'saved_voices');
if (!fs.existsSync(voicesDir)) {
  fs.mkdirSync(voicesDir, { recursive: true });
}

// Serve generated audio files
app.use('/audio', express.static(path.join(__dirname, 'output')));

// Ensure output directory exists
const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Upload reference audio for voice cloning
app.post('/api/upload-reference', upload.single('audio'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({ success: true, path: req.file.path });
});

// Save a cloned voice for reuse
app.post('/api/save-voice', async (req, res) => {
  const { name, refText } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Voice name is required' });
  }

  const refAudioPath = path.join(__dirname, 'uploads', 'reference_audio.wav');
  if (!fs.existsSync(refAudioPath)) {
    return res.status(400).json({ error: 'No reference audio uploaded' });
  }

  const voiceId = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const voiceDir = path.join(voicesDir, voiceId);

  if (!fs.existsSync(voiceDir)) {
    fs.mkdirSync(voiceDir, { recursive: true });
  }

  // Copy audio file
  const audioPath = path.join(voiceDir, 'audio.wav');
  fs.copyFileSync(refAudioPath, audioPath);

  // Extract and cache speaker embedding for faster generation
  const embeddingPath = path.join(voiceDir, 'embedding.npy');
  const venvPython = path.join(__dirname, '..', 'venv', 'bin', 'python3');
  const extractScript = path.join(__dirname, 'extract_embedding.py');

  console.log('Extracting speaker embedding...');

  try {
    await new Promise((resolve, reject) => {
      const proc = spawn(venvPython, [
        extractScript,
        '--audio', audioPath,
        '--output', embeddingPath
      ]);

      let stderr = '';
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
        console.log('Extract stderr:', data.toString());
      });
      proc.stdout.on('data', (data) => {
        console.log('Extract stdout:', data.toString());
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Embedding extraction failed: ${stderr}`));
        }
      });
    });

    console.log('Speaker embedding cached successfully');
  } catch (error) {
    console.error('Failed to extract embedding:', error.message);
    // Continue without embedding - will fall back to audio processing
  }

  // Save metadata
  const metadata = {
    id: voiceId,
    name: name,
    refText: refText || '',
    hasEmbedding: fs.existsSync(embeddingPath),
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(voiceDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

  res.json({ success: true, voice: metadata });
});

// List saved voices
app.get('/api/voices', (req, res) => {
  const voices = [];

  if (fs.existsSync(voicesDir)) {
    const dirs = fs.readdirSync(voicesDir);
    for (const dir of dirs) {
      const metadataPath = path.join(voicesDir, dir, 'metadata.json');
      if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        voices.push(metadata);
      }
    }
  }

  res.json({ voices });
});

// Delete a saved voice
app.delete('/api/voices/:id', (req, res) => {
  const voiceDir = path.join(voicesDir, req.params.id);

  if (fs.existsSync(voiceDir)) {
    fs.rmSync(voiceDir, { recursive: true });
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Voice not found' });
  }
});

// Rename a saved voice
app.put('/api/voices/:id/rename', (req, res) => {
  const voiceDir = path.join(voicesDir, req.params.id);
  const metadataPath = path.join(voiceDir, 'metadata.json');

  if (!fs.existsSync(metadataPath)) {
    return res.status(404).json({ error: 'Voice not found' });
  }

  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
  metadata.name = name;
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  res.json({ success: true, voice: metadata });
});

// Generate TTS
app.post('/api/generate', async (req, res) => {
  console.log('Request body:', JSON.stringify(req.body, null, 2));

  const {
    text,
    mode,           // 'custom_voice', 'voice_clone', 'voice_design'
    model,          // model size: '0.6B' or '1.7B'
    speaker,        // for custom_voice mode
    language,
    instruct,       // style instruction
    refText,        // reference text for voice cloning
    voiceDescription, // for voice design mode
    savedVoiceId    // for using saved voices
  } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  const outputFile = path.join(outputDir, `output_${Date.now()}.wav`);
  const venvPython = path.join(__dirname, '..', 'venv', 'bin', 'python3');
  const scriptPath = path.join(__dirname, 'tts_generate.py');

  const args = [
    scriptPath,
    '--text', text,
    '--mode', mode || 'custom_voice',
    '--model', model || '0.6B',
    '--language', language || 'English',
    '--output', outputFile
  ];

  if (speaker) args.push('--speaker', speaker);
  if (instruct) args.push('--instruct', instruct);
  if (refText) args.push('--ref-text', refText);
  if (voiceDescription) args.push('--voice-description', voiceDescription);

  // Check for saved voice or uploaded reference
  let refAudioPath;
  let embeddingPath;

  if (mode === 'voice_clone') {
    if (savedVoiceId) {
      // Use saved voice
      const savedVoiceDir = path.join(voicesDir, savedVoiceId);
      const savedAudioPath = path.join(savedVoiceDir, 'audio.wav');
      const savedEmbeddingPath = path.join(savedVoiceDir, 'embedding.npy');
      const metadataPath = path.join(savedVoiceDir, 'metadata.json');

      // Prefer cached embedding (faster) over audio processing
      if (fs.existsSync(savedEmbeddingPath)) {
        embeddingPath = savedEmbeddingPath;
        console.log('Using cached speaker embedding for faster generation');
      } else if (fs.existsSync(savedAudioPath)) {
        refAudioPath = savedAudioPath;
        // Use saved refText if not provided
        if (!refText && fs.existsSync(metadataPath)) {
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
          args.push('--ref-text', metadata.refText || '');
        }
      }
    } else {
      // Use uploaded reference
      refAudioPath = path.join(__dirname, 'uploads', 'reference_audio.wav');
    }

    // Add embedding or audio path to args
    if (embeddingPath) {
      args.push('--speaker-embedding', embeddingPath);
    } else if (refAudioPath && fs.existsSync(refAudioPath)) {
      args.push('--ref-audio', refAudioPath);
    }
  }

  console.log('Running TTS with args:', args);

  const process = spawn(venvPython, args);

  let stdout = '';
  let stderr = '';

  process.stdout.on('data', (data) => {
    stdout += data.toString();
    console.log('Python stdout:', data.toString());
  });

  process.stderr.on('data', (data) => {
    stderr += data.toString();
    console.log('Python stderr:', data.toString());
  });

  process.on('close', (code) => {
    if (code !== 0) {
      console.error('Python process failed:', stderr);
      return res.status(500).json({ error: 'TTS generation failed', details: stderr });
    }

    const audioUrl = `/audio/${path.basename(outputFile)}`;
    res.json({ success: true, audioUrl });
  });
});

// Get all voices (preset + custom) for unified dropdown
app.get('/api/all-voices', (req, res) => {
  // Preset speakers
  const preset = [
    { id: 'Ryan', name: 'Ryan', description: 'Dynamic, strong rhythm', language: 'English' },
    { id: 'Aiden', name: 'Aiden', description: 'Sunny, clear midrange', language: 'English' },
    { id: 'Vivian', name: 'Vivian', description: 'Bright, edgy female', language: 'Chinese' },
    { id: 'Serena', name: 'Serena', description: 'Warm, gentle female', language: 'Chinese' },
    { id: 'Uncle_Fu', name: 'Uncle Fu', description: 'Seasoned, mellow male', language: 'Chinese' },
    { id: 'Dylan', name: 'Dylan', description: 'Youthful Beijing male', language: 'Chinese' },
    { id: 'Eric', name: 'Eric', description: 'Lively Sichuan male', language: 'Chinese' },
    { id: 'Ono_Anna', name: 'Ono Anna', description: 'Playful, light female', language: 'Japanese' },
    { id: 'Sohee', name: 'Sohee', description: 'Warm, emotional female', language: 'Korean' }
  ];

  // Custom/saved voices
  const custom = [];
  if (fs.existsSync(voicesDir)) {
    const dirs = fs.readdirSync(voicesDir);
    for (const dir of dirs) {
      const metadataPath = path.join(voicesDir, dir, 'metadata.json');
      if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        custom.push(metadata);
      }
    }
  }

  res.json({ preset, custom });
});

// Get available configurations
app.get('/api/config', (req, res) => {
  res.json({
    modes: [
      { id: 'custom_voice', name: 'Custom Voice', description: 'Use preset voices with optional style instructions' },
      { id: 'voice_clone', name: 'Voice Clone', description: 'Clone a voice from a reference audio' },
      { id: 'voice_design', name: 'Voice Design', description: 'Design a voice using natural language description' }
    ],
    models: [
      { id: '0.6B', name: '0.6B (Faster)', description: 'Smaller model, faster generation' },
      { id: '1.7B', name: '1.7B (Better Quality)', description: 'Larger model, better quality' }
    ],
    speakers: [
      { id: 'Ryan', name: 'Ryan', description: 'Dynamic male, strong rhythm', language: 'English' },
      { id: 'Aiden', name: 'Aiden', description: 'Sunny American male, clear midrange', language: 'English' },
      { id: 'Vivian', name: 'Vivian', description: 'Bright, slightly edgy young female', language: 'Chinese' },
      { id: 'Serena', name: 'Serena', description: 'Warm, gentle young female', language: 'Chinese' },
      { id: 'Uncle_Fu', name: 'Uncle Fu', description: 'Seasoned male, low mellow timbre', language: 'Chinese' },
      { id: 'Dylan', name: 'Dylan', description: 'Youthful Beijing male, clear natural', language: 'Chinese (Beijing)' },
      { id: 'Eric', name: 'Eric', description: 'Lively Chengdu male, slightly husky', language: 'Chinese (Sichuan)' },
      { id: 'Ono_Anna', name: 'Ono Anna', description: 'Playful Japanese female, light nimble', language: 'Japanese' },
      { id: 'Sohee', name: 'Sohee', description: 'Warm Korean female, rich emotion', language: 'Korean' }
    ],
    languages: [
      'Auto', 'English', 'Chinese', 'Japanese', 'Korean',
      'German', 'French', 'Russian', 'Portuguese', 'Spanish', 'Italian'
    ]
  });
});

app.listen(PORT, () => {
  console.log(`Qwen3-TTS Web UI running at http://localhost:${PORT}`);
});

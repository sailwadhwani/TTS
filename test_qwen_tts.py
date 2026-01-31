import torch
import soundfile as sf
from qwen_tts import Qwen3TTSModel

print(f"PyTorch version: {torch.__version__}")
print(f"MPS available: {torch.backends.mps.is_available()}")

# Try MPS first, fallback to CPU
if torch.backends.mps.is_available():
    device = "mps"
    print("Using MPS (Apple Silicon GPU)")
else:
    device = "cpu"
    print("Using CPU")

print("\nLoading model (this will download ~1.2GB on first run)...")

try:
    model = Qwen3TTSModel.from_pretrained(
        "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
        device_map=device,
        dtype=torch.float32,  # MPS may need float32 instead of bfloat16
    )
    print("Model loaded successfully!")

    print("\nGenerating speech...")
    wavs, sr = model.generate_custom_voice(
        text="Hello! This is a test of Qwen 3 text to speech running locally on Mac.",
        language="English",
        speaker="Ryan",
    )

    output_path = "/Users/sail/Documents/projects/TTS/test_output.wav"
    sf.write(output_path, wavs[0], sr)
    print(f"\nSaved audio to: {output_path}")
    print("Success!")

except Exception as e:
    print(f"\nError: {e}")
    print("\nTrying CPU fallback...")

    try:
        model = Qwen3TTSModel.from_pretrained(
            "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
            device_map="cpu",
            dtype=torch.float32,
        )
        print("Model loaded on CPU!")

        print("\nGenerating speech (this may be slow on CPU)...")
        wavs, sr = model.generate_custom_voice(
            text="Hello! This is a test of Qwen 3 text to speech.",
            language="English",
            speaker="Ryan",
        )

        output_path = "/Users/sail/Documents/projects/TTS/test_output.wav"
        sf.write(output_path, wavs[0], sr)
        print(f"\nSaved audio to: {output_path}")
        print("Success on CPU!")

    except Exception as e2:
        print(f"CPU also failed: {e2}")

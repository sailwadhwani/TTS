#!/usr/bin/env python3
import argparse
import torch
import soundfile as sf
from qwen_tts import Qwen3TTSModel

# Cache models to avoid reloading
_model_cache = {}

def get_model(mode, model_size):
    """Get or load model from cache."""
    if mode == 'custom_voice':
        model_name = f"Qwen/Qwen3-TTS-12Hz-{model_size}-CustomVoice"
    elif mode == 'voice_clone':
        model_name = f"Qwen/Qwen3-TTS-12Hz-{model_size}-Base"
    elif mode == 'voice_design':
        model_name = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"  # Only 1.7B available
    else:
        raise ValueError(f"Unknown mode: {mode}")

    if model_name not in _model_cache:
        print(f"Loading model: {model_name}")
        _model_cache[model_name] = Qwen3TTSModel.from_pretrained(
            model_name,
            device_map="mps",
            dtype=torch.float32,
        )

    return _model_cache[model_name]

def main():
    parser = argparse.ArgumentParser(description='Qwen3-TTS Generator')
    parser.add_argument('--text', required=True, help='Text to synthesize')
    parser.add_argument('--mode', default='custom_voice', choices=['custom_voice', 'voice_clone', 'voice_design'])
    parser.add_argument('--model', default='0.6B', choices=['0.6B', '1.7B'])
    parser.add_argument('--speaker', default='Ryan', help='Speaker for custom_voice mode')
    parser.add_argument('--language', default='English', help='Language')
    parser.add_argument('--instruct', default='', help='Style instruction')
    parser.add_argument('--ref-audio', help='Reference audio path for voice cloning')
    parser.add_argument('--ref-text', default='', help='Reference text for voice cloning')
    parser.add_argument('--voice-description', default='', help='Voice description for voice design')
    parser.add_argument('--output', required=True, help='Output WAV file path')

    args = parser.parse_args()

    model = get_model(args.mode, args.model)

    if args.mode == 'custom_voice':
        kwargs = {
            'text': args.text,
            'language': args.language,
            'speaker': args.speaker,
        }
        if args.instruct:
            kwargs['instruct'] = args.instruct
        wavs, sr = model.generate_custom_voice(**kwargs)

    elif args.mode == 'voice_clone':
        if not args.ref_audio:
            raise ValueError("Reference audio required for voice cloning")
        wavs, sr = model.generate_voice_clone(
            text=args.text,
            language=args.language,
            ref_audio=args.ref_audio,
            ref_text=args.ref_text or "Reference audio transcript.",
        )

    elif args.mode == 'voice_design':
        if not args.voice_description:
            raise ValueError("Voice description required for voice design")
        wavs, sr = model.generate_voice_design(
            text=args.text,
            language=args.language,
            instruct=args.voice_description,
        )

    sf.write(args.output, wavs[0], sr)
    print(f"Saved to: {args.output}")

if __name__ == '__main__':
    main()

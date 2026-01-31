#!/usr/bin/env python3
"""Extract and cache speaker embedding from reference audio."""
import argparse
import torch
import numpy as np
from qwen_tts import Qwen3TTSModel

def main():
    parser = argparse.ArgumentParser(description='Extract speaker embedding')
    parser.add_argument('--audio', required=True, help='Reference audio path')
    parser.add_argument('--output', required=True, help='Output .npy file for embedding')
    args = parser.parse_args()

    print("Loading model for embedding extraction...")
    model = Qwen3TTSModel.from_pretrained(
        "Qwen/Qwen3-TTS-12Hz-0.6B-Base",
        device_map="mps",
        dtype=torch.float32,
    )

    print(f"Extracting embedding from: {args.audio}")
    # Use create_voice_clone_prompt with x_vector_only_mode to get speaker embedding
    prompt_items = model.create_voice_clone_prompt(
        ref_audio=args.audio,
        x_vector_only_mode=True  # Only extract speaker embedding, no ICL
    )

    # Extract the speaker embedding from the prompt item
    if prompt_items and len(prompt_items) > 0:
        # VoiceClonePromptItem has direct attributes
        spk_embedding = prompt_items[0].ref_spk_embedding

        if spk_embedding is not None:
            # Convert to numpy and save
            if isinstance(spk_embedding, torch.Tensor):
                spk_embedding = spk_embedding.cpu().numpy()
            np.save(args.output, spk_embedding)
            print(f"Speaker embedding saved to: {args.output}")
            print(f"Embedding shape: {spk_embedding.shape}")
        else:
            print("Error: Could not extract speaker embedding")
            exit(1)
    else:
        print("Error: No prompt items returned")
        exit(1)

if __name__ == '__main__':
    main()

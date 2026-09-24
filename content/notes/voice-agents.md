---
title: "Voice Agents"
date: 2026-09-24T15:39:15+0545
draft: false
searchHidden: false
# Tags become nodes in the notes graph — a note with no tags and no links shows
# up as an isolated dot, which is a useful signal that it needs connecting.
tags: []
---

# ASR (automatic speech recognition)
We need one model to convert mic input -> text (for llm)
Voice Activity Detection (VAD) -> is the mic input even voice?

Cut waveforms into frames
Frames => Mel Spectrogram
Spectrogram => Audio tokens => transformer/model

We only hear 8kHz or less. So Nyquist critirion, means 2x8 = 16kHz
In practice, we assume 20kHz hearing limit, and a small buffer for audio filters to work so record upto 2x20 + 4.1 = 44.1kHz


Chunk = What ASR model receives (1-30s clips) (input)
Frame = short non overlapping audio segments (10-30 ms), to perform VAD
Window = 25ms ish with overlapping window -> for Spectrogram
  overlap for preventing abrupt context break (similar thing is done in RAG)

![](/notes/voice-agents/image.png)


It matters what frequency the ASR model is trained on. (it will interpret the input as a different audio otherwise)

### Mel Spectrogram
First apply a Hann window (filter of 25ms) then FFT the audio signal(window - not chunks or frames), then plot the frequency in a graph of 80 buckets. Log buckets (natural human feel, ears are logarithm)
![](/notes/voice-agents/image-2.png)
Mel Graph is showing each 25ms which bucket has how much frequency component.


## Transformer architecture
Mel Spectrogram => tranformer => Output token(audio transcription)

How to tokenize spectrogram?
Token at input => sounds (hello word can have different tokens)
Token at output => hello means the same token

Audio signal is a token! There is no vocabulary. Self attention runs over these audio vector.

After this, 2d convolution over spectrogram
Conceptually, each kernel gets one characteristic like (frequency, harmonic, ...)

Then normal transformer architecture, positional embedding added, Encoder block with self attention, decoder block with cross attention and self attention.
![](/notes/voice-agents/image-3.png)

VAD is done before Mel Spectrogram
WebRTC VAD(basic algorithm, us scale), SileroVAD (neural network, ms scale)

Full Pipeline
![](/notes/voice-agents/image-4.png)


# TTS 
Text => normalize (eg. $ => Dollar, as it would be pronounced) => Phonemes => Mel spectrogram => voice 

text (grapheme) => phoneme is also a model (usually seq2seq)
Phoneme => Spectrogram is done by another model (not transformer, bunch of convolution(up sampling) and MTR (a sort of sampling far and near type thing))
  tokenize phonemes -> embedding lookup -> transformer encoder -> variance adaptor + length regulator (duration, pitch, energy prediction) -> decoder
  

Voice cloning: inject a voice identity vector in to the decoder (phoneme => spectrogram process)

To playback audio, give a sentenct to TTS not words (TTS can perform better with more context)

# Tools and Memory
Tool Calling
  LLM sees JSON schema
  ```
  {
    "name": "get_weather",
    "description": "Look up weather in a city",
    "parameters": {
      "type": "object",
        "properties": {
          "city": {
          "type": string,
          "description": "City name"
          }
        }
      }...
  }
  ```
We should not always inject the response back (context pollution)

## Streaming, chunking, barge-in
Batching flow
  Endpoint detection, -> ASR -> text -> LLM -> TTS -> Audio

Streaming is basically pipelining 
  No waiting (partial transcripts) => llm begin reasoning -> TTS after first sentence maybe? -> Audio 

- ASR can start before user pauses (ignore endpoint)
- LLM output can directly be sent to TTS (no need to wait for it to complete fully)
  So total time is now T(endpoint) + T(LLM first chunk) + T(TTS) instead of previous T(endpoint) + T(ASR) + T(LLM full) + T(TTS)

  Partial Transcipts: Words appearing as we speak. ASR processes them and shows just visually. No point in sending the partial scripts like (i, i want, i want to, ...) to the LLM
  Buffer: buffer audio signal (audio might need to be buffered becaues of netowork transmission or the mic input might have intrinsic jitter) to pass to ASR.
  Turn detection: Pause detection, classify pause, is the intent complete? (use small llm), maybe tool_call's can provide a hint, if i dont have which city user lives in upto now, i cannot lookup weather, so assume intent is not complete(not always applicable).

  Barge-in: Pause when user speaks over agents voice. Jitter buffer (the output of TTS is buffered to provide smooth playback). So in barge-in as well clear this buffer.
    VAD triggered -> drain buffers -> do all pipeline stuff again
  And also add a `[interrupted by user]`  to the LLM context so that the LLM context also knows it was interrupted and can act on it.

  Double talk/Echo: Agent speaks -> mic listens (infinite loop), ASR can detect maybe, or acoustic echo cancellation (AEC).


### Speech to speech models: 
audio signal -> continuous vector (not mel spectrogram), find nearest from codebook to get the token.
Codebook: Token ID => Vector mapping learned or crafted
Find the error (coodbook value - original signal), and then use a second codebook for the error. Layer codebooks to reduce errors and get Layer x Tokens. This is called RVQ(Residual Vector Quantization).
Now that we have a discrete vector. (list of tokens)
This RVQ token captures the timbre, pitch, emotion,... and is essentially capturing everything about the audio. But to extract a semantic meaning we use a nother model trained in self-supervision like (HuBERT) so the model stays on topic and captures semantic meaning. Finally we use both these embeddings (RVQ tokens and the Codec(HuBERT)) to arrive at a single 

A transformer working(attention mechanism) on 3 streams (mixed into one from perspective of transformer)

input audio tokens(rvq embedding) + text embedding (codec output) + output audio tokens (rvq embedding)
predict next token => audio output


function assertLameAvailable() {
  if (!globalThis.lamejs?.Mp3Encoder) {
    throw new Error(
      "MP3 encoder not loaded. Ensure lamejs is available (window.lamejs).",
    );
  }
}

function floatTo16BitPCM(float32Array) {
  const int16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

function interleave(left, right) {
  const length = left.length + right.length;
  const result = new Float32Array(length);
  let index = 0;
  for (let i = 0; i < left.length; i++) {
    result[index++] = left[i];
    result[index++] = right[i];
  }
  return result;
}

export async function recordToMp3({ onStatus } = {}) {
  assertLameAvailable();

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

  const chunks = [];
  recorder.addEventListener("dataavailable", (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  });

  const stopPromise = new Promise((resolve, reject) => {
    recorder.addEventListener("stop", resolve);
    recorder.addEventListener("error", reject);
  });

  recorder.start();
  onStatus?.("Recording…");

  return {
    stop: async () => {
      recorder.stop();
      await stopPromise;
      for (const track of stream.getTracks()) track.stop();

      onStatus?.("Converting to MP3…");
      const webmBlob = new Blob(chunks, { type: "audio/webm" });
      const webmArrayBuffer = await webmBlob.arrayBuffer();

      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      const decoded = await audioContext.decodeAudioData(webmArrayBuffer);

      const sampleRate = decoded.sampleRate;
      const channels = decoded.numberOfChannels;

      let pcm;
      if (channels === 1) {
        pcm = floatTo16BitPCM(decoded.getChannelData(0));
      } else {
        const left = decoded.getChannelData(0);
        const right = decoded.getChannelData(1);
        pcm = floatTo16BitPCM(interleave(left, right));
      }

      const kbps = 128;
      const mp3Encoder = new globalThis.lamejs.Mp3Encoder(
        channels,
        sampleRate,
        kbps,
      );

      const mp3Chunks = [];
      const samplesPerFrame = 1152;

      for (let i = 0; i < pcm.length; i += samplesPerFrame * channels) {
        const frame = pcm.subarray(i, i + samplesPerFrame * channels);
        const mp3buf = mp3Encoder.encodeBuffer(frame);
        if (mp3buf.length > 0) mp3Chunks.push(new Uint8Array(mp3buf));
      }

      const endBuf = mp3Encoder.flush();
      if (endBuf.length > 0) mp3Chunks.push(new Uint8Array(endBuf));

      const mp3Blob = new Blob(mp3Chunks, { type: "audio/mpeg" });
      const durationSec = decoded.duration;

      try {
        await audioContext.close();
      } catch {
        // ignore
      }

      onStatus?.("Ready");
      return { mp3Blob, durationSec, sampleRate, channels };
    },
  };
}

